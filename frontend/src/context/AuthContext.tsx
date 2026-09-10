"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  authApi,
  clearToken,
  describeError,
  getToken,
  setToken,
  setUnauthorizedHandler,
  type User,
} from "@/lib/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  initializing: boolean;
  error: string | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  // Validate a persisted token on mount; register the global 401 hook.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = getToken();
      if (!stored) {
        if (!cancelled) setInitializing(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setTokenState(stored);
      } catch (err) {
        if (cancelled) return;
        clearToken();
        if (err instanceof Error && err.name === "TypeError") {
          setError("Cannot reach the server. Start the backend and reload.");
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    setUnauthorizedHandler(handleUnauthorized);
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [handleUnauthorized]);

  const applySession = useCallback((sessionToken: string, sessionUser: User) => {
    setToken(sessionToken);
    setTokenState(sessionToken);
    setUser(sessionUser);
    setError(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const session = await authApi.login(email, password);
        applySession(session.token, session.user);
      } catch (err) {
        setError(describeError(err));
        throw err;
      }
    },
    [applySession]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const session = await authApi.register(email, password);
        applySession(session.token, session.user);
      } catch (err) {
        setError(describeError(err));
        throw err;
      }
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    clearToken();
    setTokenState(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        initializing,
        error,
        clearError,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
