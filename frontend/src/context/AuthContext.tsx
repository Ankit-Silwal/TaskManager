"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginUser, logoutUser, refreshAccessToken, registerUser, setAccessToken } from "@/lib/api";
import type { User } from "@/lib/types";

// The backend's refresh endpoint returns only a new access token, so the user's
// profile is cached here to show their name after a page reload.
const USER_KEY = "taskmanager.user";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function storeUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Storage can be unavailable in private windows. The session still works without it.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, trade the refresh cookie for a new access token to restore the session.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredUser();
    const restore = stored ? refreshAccessToken() : Promise.resolve(false);
    restore.then((ok) => {
      if (cancelled) return;
      if (ok && stored) {
        setUser(stored);
      } else {
        storeUser(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginUser(email, password);
    storeUser(u);
    setUser(u);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const u = await registerUser(name, email, password);
    storeUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setAccessToken(null);
      storeUser(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
