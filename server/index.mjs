import "dotenv/config";
import cookieSession from "cookie-session";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { ASSESSMENT_ID, getChapter, publicChapter } from "./chapters.mjs";
import { db, publicUser } from "./db.mjs";
import { capMs, isExpired, rateLimit, remainingMs } from "./limits.mjs";
import { sendVerificationEmail } from "./mail.mjs";
import { buildCoachMemory, inferLevel, withMemory } from "./memory.mjs";
import { hashPassword, normalizeEmail, validateSignup, verifyPassword } from "./password.mjs";
import {
  decorateChapters,
  ensureTopicOrder,
  isChapterUnlocked,
  METRIC_LABELS,
  needsAssessment,
  situationProgress,
} from "./progress.mjs";
import {
  drillRecommendation,
  getProgram,
  programForFocusArea,
  programState,
  publicPrograms,
  todayRecommendation,
} from "./programs.mjs";
import { weeklyReport } from "./report.mjs";
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
  INSERT INTO practice_sessions (id, user_id, chapter_id, status, started_at, difficulty_mode, kind, focus)
  VALUES (@id, @user_id, @chapter_id, 'live', @started_at, @difficulty_mode, @kind, @focus)
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
  LIMIT 80
`);
const listLiveSessions = db.prepare(`
  SELECT * FROM practice_sessions
  WHERE user_id = ? AND status = 'live'
`);
const markTalkStarted = db.prepare(`
  UPDATE practice_sessions SET talk_started_at = @talk_started_at
  WHERE id = @id AND talk_started_at IS NULL
`);
const DIFFICULTY_MODES = new Set(["gentle", "standard", "challenge"]);

app.set("trust proxy", 1);
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

function sessionInstructions(row, scored) {
  const chapter = getChapter(row.chapter_id);
  if (!chapter) return undefined;
  const level = inferLevel(scored);
  const firstAssessment = row.chapter_id === ASSESSMENT_ID && scored.length === 0;
  return withMemory(chapter.instructions, buildCoachMemory(scored), {
    level,
    firstAssessment,
    difficultyMode: normalizeDifficultyMode(row.difficulty_mode),
    drill: row.kind === "drill",
    focus: row.focus || null,
  });
}

function publicSession(row, { instructions = false, scored = [] } = {}) {
  const chapter = getChapter(row.chapter_id);
  return {
    id: row.id,
    status: row.status,
    difficultyMode: DIFFICULTY_MODES.has(row.difficulty_mode) ? row.difficulty_mode : "standard",
    kind: row.kind === "drill" ? "drill" : row.chapter_id === ASSESSMENT_ID ? "assessment" : "practice",
    focus: row.focus || null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    talkStartedAt: row.talk_started_at,
    remainingMs: row.status === "live" ? remainingMs(row) : null,
    maxMs: capMs(row),
    overall: row.overall,
    weakness: row.weakness,
    nextFocus: row.next_focus,
    chapter: chapter ? publicChapter(chapter) : { id: row.chapter_id, title: row.chapter_id },
    transcript: row.transcript_json ? JSON.parse(row.transcript_json) : [],
    scores: row.scores_json ? JSON.parse(row.scores_json) : null,
    instructions: instructions ? sessionInstructions(row, scored) : undefined,
  };
}

function sweepLiveSessions(userId) {
  for (const row of listLiveSessions.all(userId)) {
    if (isExpired(row)) {
      abandonSession.run({
        id: row.id,
        user_id: userId,
        ended_at: new Date().toISOString(),
      });
    }
  }
}

function activeTalkSessions(userId, exceptId) {
  sweepLiveSessions(userId);
  return listLiveSessions
    .all(userId)
    .filter((row) => row.talk_started_at && row.id !== exceptId);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  });
});

app.post(
  "/api/auth/google",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many sign-in attempts. Wait a few minutes.",
  }),
  async (req, res) => {
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

const upsertPendingSignup = db.prepare(`
  INSERT INTO pending_signups (email, name, password_hash, code_hash, attempts, expires_at, last_sent_at, created_at)
  VALUES (@email, @name, @password_hash, @code_hash, 0, @expires_at, @last_sent_at, @created_at)
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    password_hash = excluded.password_hash,
    code_hash = excluded.code_hash,
    attempts = 0,
    expires_at = excluded.expires_at,
    last_sent_at = excluded.last_sent_at
`);
const selectPendingSignup = db.prepare("SELECT * FROM pending_signups WHERE email = ?");
const bumpPendingAttempts = db.prepare(
  "UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?",
);
const refreshPendingCode = db.prepare(`
  UPDATE pending_signups
  SET code_hash = @code_hash, attempts = 0, expires_at = @expires_at, last_sent_at = @last_sent_at
  WHERE email = @email
`);
const deletePendingSignup = db.prepare("DELETE FROM pending_signups WHERE email = ?");
const sweepPendingSignups = db.prepare("DELETE FROM pending_signups WHERE expires_at < ?");

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function newVerificationCode() {
  return String(randomInt(100000, 1000000));
}

function hashCode(email, code) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

app.post(
  "/api/auth/signup",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: "Too many accounts from this network. Try again later.",
  }),
  async (req, res) => {
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

app.post(
  "/api/auth/verify",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many verification attempts. Wait a few minutes.",
  }),
  (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();
  const pending = email ? selectPendingSignup.get(email) : null;

  if (!pending) {
    res.status(400).json({ error: "Start the signup again — we have no pending code for this email." });
    return;
  }
  if (Date.parse(pending.expires_at) < Date.now()) {
    res.status(400).json({ error: "That code expired. Request a new one." });
    return;
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    res.status(429).json({ error: "Too many wrong codes. Request a new one." });
    return;
  }
  if (!/^\d{6}$/.test(code) || hashCode(email, code) !== pending.code_hash) {
    bumpPendingAttempts.run(email);
    res.status(400).json({ error: "That code is not right. Check the email and try again." });
    return;
  }

  // Handle the rare race where the email got registered while pending.
  if (selectUserByEmail.get(email)) {
    deletePendingSignup.run(email);
    res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return;
  }

  const id = randomUUID();
  insertPasswordUser.run({
    id,
    email,
    name: pending.name,
    password_hash: pending.password_hash,
    created_at: new Date().toISOString(),
  });
  deletePendingSignup.run(email);
  req.session.userId = id;
  res.status(201).json({ user: publicUser(selectUserById.get(id)) });
});

app.post(
  "/api/auth/resend",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: "Too many resend requests. Wait a few minutes.",
  }),
  async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const pending = email ? selectPendingSignup.get(email) : null;
  if (!pending) {
    res.status(400).json({ error: "Start the signup again — we have no pending code for this email." });
    return;
  }
  try {
    const code = newVerificationCode();
    const now = new Date();
    refreshPendingCode.run({
      email,
      code_hash: hashCode(email, code),
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      last_sent_at: now.toISOString(),
    });
    await sendVerificationEmail(email, pending.name, code);
    res.json({ ok: true });
  } catch (error) {
    console.error("Resend failed", error);
    res.status(500).json({ error: "Could not send the email. Try again." });
  }
});

app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many sign-in attempts. Wait a few minutes.",
  }),
  async (req, res) => {
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

const updateFocusArea = db.prepare("UPDATE users SET focus_area = @focus_area WHERE id = @id");
const updateProgram = db.prepare(`
  UPDATE users
  SET program_id = @program_id, program_started_at = @program_started_at
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

function normalizeDifficultyMode(value) {
  return DIFFICULTY_MODES.has(value) ? value : "standard";
}

function autoDifficulty(levelId) {
  if (levelId === "starter") return "gentle";
  if (levelId === "confident") return "challenge";
  return "standard";
}

app.get("/api/me", requireUser, (req, res) => {
  sweepLiveSessions(req.user.id);
  const history = listSessions.all(req.user.id);
  const scored = listScoredSessions.all(req.user.id);
  const order = ensureTopicOrder(db, req.user);
  const profile = summarizeProfile(scored);
  res.json({
    user: publicUser(req.user),
    profile,
    metricOptions: METRIC_LABELS,
    chapters: decorateChapters(order, scored),
    needsAssessment: needsAssessment(scored),
    progress: situationProgress(scored),
    level: inferLevel(scored),
    assessment: publicChapter(getChapter(ASSESSMENT_ID)),
    today: todayRecommendation(req.user, scored, profile),
    drill: drillRecommendation(scored, profile),
    program: programState(req.user, scored),
    programs: publicPrograms(),
    recent: history.slice(0, 6).map((row) => publicSession(row, { scored })),
  });
});

const FOCUS_AREAS = new Set(["interview", "workplace", "client"]);

app.post("/api/onboarding", requireUser, (req, res) => {
  const focusArea = String(req.body?.focusArea || "");
  if (!FOCUS_AREAS.has(focusArea)) {
    res.status(400).json({ error: "Pick what you need English for." });
    return;
  }
  updateFocusArea.run({ id: req.user.id, focus_area: focusArea });
  const program = programForFocusArea(focusArea);
  updateProgram.run({
    id: req.user.id,
    program_id: program.id,
    program_started_at: new Date().toISOString(),
  });
  const user = selectUserById.get(req.user.id);
  const scored = listScoredSessions.all(req.user.id);
  res.json({ user: publicUser(user), program: programState(user, scored) });
});

app.post("/api/program", requireUser, (req, res) => {
  const programId = req.body?.programId;
  if (programId === null) {
    updateProgram.run({ id: req.user.id, program_id: null, program_started_at: null });
    res.json({ program: null });
    return;
  }
  const program = getProgram(programId);
  if (!program) {
    res.status(400).json({ error: "Choose a valid program." });
    return;
  }
  updateProgram.run({
    id: req.user.id,
    program_id: program.id,
    program_started_at: new Date().toISOString(),
  });
  const user = selectUserById.get(req.user.id);
  const scored = listScoredSessions.all(req.user.id);
  res.json({ program: programState(user, scored) });
});

app.get("/api/report", requireUser, async (req, res) => {
  try {
    const scored = listScoredSessions.all(req.user.id);
    const report = await weeklyReport(req.user, scored);
    res.json({ report });
  } catch (error) {
    console.error("Weekly report failed", error);
    res.status(500).json({ error: "Could not build this week's report." });
  }
});

app.post("/api/history/reset", requireUser, (req, res) => {
  deleteUserSessions.run(req.user.id);
  resetTopicOrder.run(req.user.id);
  if (req.user.program_id) {
    updateProgram.run({
      id: req.user.id,
      program_id: req.user.program_id,
      program_started_at: new Date().toISOString(),
    });
  }
  res.json({ ok: true });
});

app.get("/api/sessions", requireUser, (req, res) => {
  const scored = listScoredSessions.all(req.user.id);
  res.json({
    sessions: listSessions.all(req.user.id).map((row) => publicSession(row, { scored })),
    progress: situationProgress(scored),
  });
});

app.post(
  "/api/sessions",
  requireUser,
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyFn: (req) => req.user?.id || req.ip,
    message: "Too many new sessions this hour.",
  }),
  (req, res) => {
  const chapter = getChapter(req.body?.chapterId);
  if (!chapter) {
    res.status(400).json({ error: "Choose a valid situation." });
    return;
  }
  const scored = listScoredSessions.all(req.user.id);
  if (!isChapterUnlocked(scored, chapter.id)) {
    res.status(403).json({ error: "Complete the opening assessment first." });
    return;
  }

  if (activeTalkSessions(req.user.id).length) {
    res.status(409).json({
      error: "A live call is already running. End that one before starting another.",
    });
    return;
  }

  abandonLiveSessions.run({
    user_id: req.user.id,
    ended_at: new Date().toISOString(),
  });

  const id = randomUUID();
  const kind =
    chapter.id === ASSESSMENT_ID ? "assessment" : req.body?.kind === "drill" ? "drill" : "practice";
  const focus =
    typeof req.body?.focus === "string" && METRIC_LABELS[req.body.focus] ? req.body.focus : null;
  const difficultyMode = DIFFICULTY_MODES.has(req.body?.difficultyMode)
    ? req.body.difficultyMode
    : chapter.id === ASSESSMENT_ID
      ? "gentle"
      : autoDifficulty(inferLevel(scored).id);
  insertSession.run({
    id,
    user_id: req.user.id,
    chapter_id: chapter.id,
    started_at: new Date().toISOString(),
    difficulty_mode: difficultyMode,
    kind,
    focus,
  });
  res.status(201).json({
    session: publicSession(selectSession.get(id), { instructions: true, scored }),
  });
});

const updateSessionMode = db.prepare(`
  UPDATE practice_sessions SET difficulty_mode = @difficulty_mode
  WHERE id = @id AND user_id = @user_id AND status = 'live' AND talk_started_at IS NULL
`);

app.post("/api/sessions/:id/mode", requireUser, (req, res) => {
  const row = selectSession.get(req.params.id);
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (row.status !== "live" || row.talk_started_at) {
    res.status(409).json({ error: "Difficulty can only change before the call starts." });
    return;
  }
  const mode = req.body?.difficultyMode;
  if (!DIFFICULTY_MODES.has(mode)) {
    res.status(400).json({ error: "Pick gentle, standard, or challenge." });
    return;
  }
  updateSessionMode.run({ id: row.id, user_id: req.user.id, difficulty_mode: mode });
  const scored = listScoredSessions.all(req.user.id);
  res.json({ session: publicSession(selectSession.get(row.id), { instructions: true, scored }) });
});

app.get("/api/sessions/:id", requireUser, (req, res) => {
  const row = selectSession.get(req.params.id);
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const scored = listScoredSessions.all(req.user.id);
  res.json({ session: publicSession(row, { instructions: true, scored }) });
});

app.post(
  "/api/token",
  requireUser,
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 8,
    keyFn: (req) => req.user?.id || req.ip,
    message: "Talk limit reached for this hour. Come back later.",
  }),
  async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const row = selectSession.get(req.body?.sessionId);
  if (!row || row.user_id !== req.user.id || row.status !== "live") {
    res.status(400).json({ error: "Start a situation before talking." });
    return;
  }
  if (isExpired(row)) {
    abandonSession.run({
      id: row.id,
      user_id: req.user.id,
      ended_at: new Date().toISOString(),
    });
    res.status(400).json({
      error: `That call hit the ${Math.round(capMs(row) / 60000)}-minute cap. Start the situation again.`,
    });
    return;
  }
  if (activeTalkSessions(req.user.id, row.id).length) {
    res.status(409).json({
      error: "A live call is already running. End that one before starting another.",
    });
    return;
  }
  const chapter = getChapter(row.chapter_id);
  if (!chapter) {
    res.status(400).json({ error: "This situation is no longer available." });
    return;
  }

  const scored = listScoredSessions.all(req.user.id);
  const instructions = sessionInstructions(row, scored);

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
          instructions,
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
    markTalkStarted.run({
      id: row.id,
      talk_started_at: row.talk_started_at || new Date().toISOString(),
    });
    const live = selectSession.get(row.id);
    res.json({
      value: data.value,
      chapter: publicChapter(chapter),
      remainingMs: remainingMs(live),
    });
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
