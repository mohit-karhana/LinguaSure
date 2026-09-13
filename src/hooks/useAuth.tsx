import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { MeResponse, User } from "../lib/types";

type AuthContextValue = {
  ready: boolean;
  user: User | null;
  me: MeResponse | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: (credential: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setMe(await api.me());
      setError(null);
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user: me?.user ?? null,
      me,
      error,
      refresh,
      login: async (credential: string) => {
        await api.login(credential);
        await refresh();
      },
      loginWithPassword: async (email: string, password: string) => {
        await api.loginWithPassword({ email, password });
        await refresh();
      },
      signup: async (name: string, email: string, password: string) => {
        await api.signup({ name, email, password });
        await refresh();
      },
      logout: async () => {
        await api.logout();
        setMe(null);
      },
    }),
    [error, me, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
