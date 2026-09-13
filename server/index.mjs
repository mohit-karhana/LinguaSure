import "dotenv/config";
import cookieSession from "cookie-session";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { getChapter, publicChapter } from "./chapters.mjs";
import { db, publicUser } from "./db.mjs";
import { hashPassword, normalizeEmail, validateSignup, verifyPassword } from "./password.mjs";
import {
  decorateChapters,
  ensureTopicOrder,
  isChapterUnlocked,
  METRIC_LABELS,
  normalizeGoal,
  userGoal,
} from "./progress.mjs";
import { buildScorecard, scoreAcoustic, scoreWithModel, summarizeProfile } from "./score.mjs";

const app = express();
const port = Number(process.env.PORT || 3001);
const requestedHost = process.env.HOST || "127.0.0.1";
const host =
  process.env.NODE_ENV === "production" &&
  (requestedHost === "127.0.0.1" || requestedHost === "localhost")
    ? "0.0.0.0"
    : requestedHost;
const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const allowedOrigins = (process.env.PUBLIC_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const insertGoogleUser = db.prepare(`
  INSERT INTO users (id, google_id, email, name, picture, created_at)
  VALUES (@id, @google_id, @email, @name, @picture, @created_at)
  ON CONFLICT(google_id) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture
`);
const insertPasswordUser = db.prepare(`
  INSERT INTO users (id, email, name, password_hash, created_at)
  VALUES (@id, @email, @name, @password_hash, @created_at)
`);
const selectUserByGoogle = db.prepare("SELECT * FROM users WHERE google_id = ?");
const selectUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const selectUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const linkGoogleId = db.prepare(`
  UPDATE users SET google_id = @google_id, name = @name, picture = @picture
  WHERE id = @id AND google_id IS NULL
`);
const insertSession = db.prepare(`
  INSERT INTO practice_sessions (id, user_id, chapter_id, status, started_at)
  VALUES (@id, @user_id, @chapter_id, 'live', @started_at)
`);
const selectSession = db.prepare("SELECT * FROM practice_sessions WHERE id = ?");
const completeSession = db.prepare(`
  UPDATE practice_sessions
  SET status = @status,
      ended_at = @ended_at,
      transcript_json = @transcript_json,
      timings_json = @timings_json,
      scores_json = @scores_json,
      weakness = @weakness,
      next_focus = @next_focus,
      overall = @overall
  WHERE id = @id AND user_id = @user_id
`);
const listSessions = db.prepare(`
  SELECT * FROM practice_sessions
  WHERE user_id = ?
  ORDER BY started_at DESC
  LIMIT 40
`);
const listScoredSessions = db.prepare(`
  SELECT * FROM practice_sessions
  WHERE user_id = ? AND status = 'scored'
  ORDER BY started_at DESC
  LIMIT 12
`);

app.use(express.json({ limit: "1mb" }));
app.use(
  cookieSession({
    name: "linguasure",
    keys: [process.env.SESSION_SECRET || "linguasure-dev-secret"],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "1",
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "microphone=(self)");
  next();
});
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") || allowedOrigins.length === 0) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "Unexpected request origin" });
    return;
  }
  next();
});

function requireUser(req, res, next) {
  const user = req.session?.userId ? selectUserById.get(req.session.userId) : null;
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  req.user = user;
  next();
}

function publicSession(row, { instructions = false } = {}) {
  const chapter = getChapter(row.chapter_id);
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    overall: row.overall,
    weakness: row.weakness,
    nextFocus: row.next_focus,
    chapter: chapter ? publicChapter(chapter) : { id: row.chapter_id, title: row.chapter_id },
    transcript: row.transcript_json ? JSON.parse(row.transcript_json) : [],
    scores: row.scores_json ? JSON.parse(row.scores_json) : null,
    instructions: instructions && chapter ? chapter.instructions : undefined,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  });
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({
      error: "Set GOOGLE_CLIENT_ID on the server to enable Google sign-in.",
    });
    return;
  }
  if (typeof req.body?.credential !== "string") {
    res.status(400).json({ error: "A Google credential is required." });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      res.status(401).json({ error: "Google did not return a usable account." });
      return;
    }

    const email = normalizeEmail(payload.email);
    const existing = selectUserByEmail.get(email);
    if (existing && !existing.google_id) {
      linkGoogleId.run({
        id: existing.id,
        google_id: payload.sub,
        name: payload.name || existing.name,
        picture: payload.picture || existing.picture,
      });
    } else {
      insertGoogleUser.run({
        id: randomUUID(),
        google_id: payload.sub,
        email,
        name: payload.name || email,
        picture: payload.picture || null,
        created_at: new Date().toISOString(),
      });
    }
    const user = selectUserByGoogle.get(payload.sub) || selectUserByEmail.get(email);
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Google sign-in failed", error);
    res.status(401).json({ error: "Google sign-in could not be verified." });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const parsed = validateSignup(req.body || {});
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  if (selectUserByEmail.get(parsed.email)) {
    res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return;
  }

  try {
    const id = randomUUID();
    insertPasswordUser.run({
      id,
      email: parsed.email,
      name: parsed.name,
      password_hash: await hashPassword(parsed.password),
      created_at: new Date().toISOString(),
    });
    req.session.userId = id;
    res.status(201).json({ user: publicUser(selectUserById.get(id)) });
  } catch (error) {
    console.error("Signup failed", error);
    res.status(500).json({ error: "Could not create the account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const user = email ? selectUserByEmail.get(email) : null;

  if (!user?.password_hash) {
    res.status(401).json({
      error: user?.google_id
        ? "This account uses Google. Continue with Google."
        : "Email or password is incorrect.",
    });
    return;
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

const updateGoal = db.prepare(`
  UPDATE users
  SET unlock_metric = @unlock_metric,
      unlock_threshold = @unlock_threshold,
      unlock_thresholds = @unlock_thresholds
  WHERE id = @id
`);
const deleteUserSessions = db.prepare("DELETE FROM practice_sessions WHERE user_id = ?");
const resetTopicOrder = db.prepare("UPDATE users SET topic_order = NULL WHERE id = ?");
const abandonLiveSessions = db.prepare(`
  UPDATE practice_sessions
  SET status = 'abandoned', ended_at = @ended_at
  WHERE user_id = @user_id AND status = 'live'
`);
const abandonSession = db.prepare(`
  UPDATE practice_sessions
  SET status = 'abandoned', ended_at = @ended_at
  WHERE id = @id AND user_id = @user_id AND status = 'live'
`);

function publicGoal(goal) {
  return {
    metric: goal.unlockMetric,
    threshold: goal.unlockThreshold,
    label: METRIC_LABELS[goal.unlockMetric],
    thresholds: goal.thresholds,
  };
}

function userProgress(user, scored) {
  const goal = userGoal(user);
  const order = ensureTopicOrder(db, user);
  return {
    goal: publicGoal(goal),
    chapters: decorateChapters(order, scored, goal),
  };
}

app.get("/api/me", requireUser, (req, res) => {
  const history = listSessions.all(req.user.id);
  const scored = listScoredSessions.all(req.user.id);
  const progress = userProgress(req.user, scored);
  res.json({
    user: publicUser(req.user),
    profile: summarizeProfile(scored),
    goal: progress.goal,
    metricOptions: METRIC_LABELS,
    chapters: progress.chapters,
    recent: history.slice(0, 6).map(publicSession),
  });
});

app.post("/api/goal", requireUser, (req, res) => {
  const current = userGoal(req.user);
  const incoming =
    req.body?.thresholds && typeof req.body.thresholds === "object"
      ? req.body.thresholds
      : current.thresholds;
  const goal = normalizeGoal(req.body?.metric, req.body?.threshold, incoming);
  updateGoal.run({
    id: req.user.id,
    unlock_metric: goal.unlockMetric,
    unlock_threshold: goal.unlockThreshold,
    unlock_thresholds: JSON.stringify(goal.thresholds),
  });
  const user = selectUserById.get(req.user.id);
  const scored = listScoredSessions.all(req.user.id);
  res.json({
    goal: publicGoal(goal),
    chapters: userProgress(user, scored).chapters,
  });
});

app.post("/api/history/reset", requireUser, (req, res) => {
  deleteUserSessions.run(req.user.id);
  resetTopicOrder.run(req.user.id);
  const user = selectUserById.get(req.user.id);
  const progress = userProgress(user, []);
  res.json({
    ok: true,
    profile: summarizeProfile([]),
    goal: progress.goal,
    chapters: progress.chapters,
    recent: [],
  });
});

app.get("/api/sessions", requireUser, (req, res) => {
  res.json({ sessions: listSessions.all(req.user.id).map(publicSession) });
});

app.post("/api/sessions", requireUser, (req, res) => {
  const chapter = getChapter(req.body?.chapterId);
  if (!chapter) {
    res.status(400).json({ error: "Choose a valid situation." });
    return;
  }
  const scored = listScoredSessions.all(req.user.id);
  const order = ensureTopicOrder(db, req.user);
  if (!isChapterUnlocked(order, scored, userGoal(req.user), chapter.id)) {
    res.status(403).json({
      error: "That situation is still locked. Hit your bar on the previous one first.",
    });
    return;
  }

  abandonLiveSessions.run({
    user_id: req.user.id,
    ended_at: new Date().toISOString(),
  });

  const id = randomUUID();
  insertSession.run({
    id,
    user_id: req.user.id,
    chapter_id: chapter.id,
    started_at: new Date().toISOString(),
  });
  res.status(201).json({ session: publicSession(selectSession.get(id), { instructions: true }) });
});

app.get("/api/sessions/:id", requireUser, (req, res) => {
  const row = selectSession.get(req.params.id);
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  res.json({ session: publicSession(row, { instructions: true }) });
});

app.post("/api/token", requireUser, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const row = selectSession.get(req.body?.sessionId);
  if (!row || row.user_id !== req.user.id || row.status !== "live") {
    res.status(400).json({ error: "Start a situation before talking." });
    return;
  }
  const chapter = getChapter(row.chapter_id);
  if (!chapter) {
    res.status(400).json({ error: "This situation is no longer available." });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1",
          instructions: chapter.instructions,
          audio: { output: { voice: "marin" } },
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || typeof data?.value !== "string") {
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : "Failed to create a realtime session token.";
      res.status(response.status || 502).json({ error: message });
      return;
    }
    res.json({ value: data.value, chapter: publicChapter(chapter) });
  } catch (error) {
    console.error("Token generation failed", error);
    res.status(500).json({ error: "Failed to create a realtime session token." });
  }
});

app.post("/api/sessions/:id/abandon", requireUser, (req, res) => {
  const row = selectSession.get(req.params.id);
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (row.status === "live") {
    abandonSession.run({
      id: row.id,
      user_id: req.user.id,
      ended_at: new Date().toISOString(),
    });
  }
  res.json({ session: publicSession(selectSession.get(row.id)) });
});

app.post("/api/sessions/:id/complete", requireUser, async (req, res) => {
  const row = selectSession.get(req.params.id);
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (row.status === "scored" && row.scores_json) {
    res.json({ session: publicSession(row) });
    return;
  }

  const chapter = getChapter(row.chapter_id);
  if (!chapter) {
    res.status(400).json({ error: "This situation is no longer available." });
    return;
  }

  const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
  const timings = req.body?.timings && typeof req.body.timings === "object" ? req.body.timings : {};

  try {
    const acoustic = scoreAcoustic(transcript, timings);
    const model = await scoreWithModel(chapter, transcript, acoustic);
    const scores = buildScorecard(chapter, transcript, timings, model);
    completeSession.run({
      id: row.id,
      user_id: req.user.id,
      status: "scored",
      ended_at: new Date().toISOString(),
      transcript_json: JSON.stringify(transcript),
      timings_json: JSON.stringify(timings),
      scores_json: JSON.stringify(scores),
      weakness: scores.weakness,
      next_focus: scores.nextFocus,
      overall: scores.overall,
    });
    res.json({ session: publicSession(selectSession.get(row.id)) });
  } catch (error) {
    console.error("Session scoring failed", error);
    const scores = buildScorecard(chapter, transcript, timings, null);
    completeSession.run({
      id: row.id,
      user_id: req.user.id,
      status: "scored",
      ended_at: new Date().toISOString(),
      transcript_json: JSON.stringify(transcript),
      timings_json: JSON.stringify(timings),
      scores_json: JSON.stringify(scores),
      weakness: scores.weakness,
      next_focus: scores.nextFocus,
      overall: scores.overall,
    });
    res.json({ session: publicSession(selectSession.get(row.id)) });
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(join(distDir, "index.html"));
  });
}

app.listen(port, host, () => {
  const url =
    host === "0.0.0.0" || host === "::"
      ? `http://localhost:${port}`
      : `http://${host}:${port}`;
  console.log(`LinguaSure ready at ${url}`);
});
