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
  loginWithPassword: (body: { email: string; password: string }) =>
    request<{ user: import("./types").User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  sessions: () =>
    request<{ sessions: import("./types").PracticeSession[] }>("/api/sessions"),
  createSession: (chapterId: string) =>
    request<{ session: import("./types").PracticeSession }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ chapterId }),
    }),
  session: (id: string) =>
    request<{ session: import("./types").PracticeSession }>(`/api/sessions/${id}`),
  token: (sessionId: string) =>
    request<{ value: string }>("/api/token", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
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
