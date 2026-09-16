async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export const api = {
  config: () => request<{ googleClientId: string }>("/api/config"),
  me: () => request<import("./types").MeResponse>("/api/me"),
  login: (credential: string) =>
    request<{ user: import("./types").User }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ user: import("./types").User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifySignup: (body: { email: string; code: string }) =>
    request<{ user: import("./types").User }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resendCode: (email: string) =>
    request<{ ok: boolean }>("/api/auth/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  loginWithPassword: (body: { email: string; password: string }) =>
    request<{ user: import("./types").User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  onboarding: (focusArea: "interview" | "workplace" | "client") =>
    request<{
      user: import("./types").User;
      program: import("./types").ProgramState | null;
    }>("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({ focusArea }),
    }),
  setProgram: (programId: string | null) =>
    request<{ program: import("./types").ProgramState | null }>("/api/program", {
      method: "POST",
      body: JSON.stringify({ programId }),
    }),
  report: () => request<{ report: import("./types").WeeklyReport | null }>("/api/report"),
  resetHistory: () =>
    request<{ ok: boolean }>("/api/history/reset", { method: "POST" }),
  sessions: () =>
    request<{
      sessions: import("./types").PracticeSession[];
      progress: import("./types").SituationProgress[];
    }>("/api/sessions"),
  createSession: (
    chapterId: string,
    options: {
      difficultyMode?: import("./types").DifficultyMode;
      kind?: "drill";
      focus?: string | null;
    } = {},
  ) =>
    request<{ session: import("./types").PracticeSession }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ chapterId, ...options }),
    }),
  setSessionMode: (id: string, difficultyMode: import("./types").DifficultyMode) =>
    request<{ session: import("./types").PracticeSession }>(`/api/sessions/${id}/mode`, {
      method: "POST",
      body: JSON.stringify({ difficultyMode }),
    }),
  session: (id: string) =>
    request<{ session: import("./types").PracticeSession }>(`/api/sessions/${id}`),
  token: (sessionId: string) =>
    request<{ value: string; remainingMs: number }>("/api/token", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  abandon: (id: string) =>
    request<{ session: import("./types").PracticeSession }>(`/api/sessions/${id}/abandon`, {
      method: "POST",
    }),
  complete: (
    id: string,
    body: {
      transcript: import("./types").TranscriptLine[];
      timings: import("./types").SessionTimings;
    },
  ) =>
    request<{ session: import("./types").PracticeSession }>(`/api/sessions/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
