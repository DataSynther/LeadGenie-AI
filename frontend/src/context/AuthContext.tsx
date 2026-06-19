import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export type UserRole = "admin" | "manager" | "sdr" | "viewer";

export interface AuthUser {
  username: string;
  token: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "lg_auth_token";
const USER_KEY  = "lg_auth_user";
const ROLE_KEY  = "lg_auth_role";
const BASE_URL  = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token    = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USER_KEY);
    const role     = (localStorage.getItem(ROLE_KEY) ?? "viewer") as UserRole;
    if (token && username) return { token, username, role };
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Invalid credentials");
      }
      const data = await res.json() as { token: string; username: string; role: UserRole };
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, data.username);
      localStorage.setItem(ROLE_KEY, data.role ?? "viewer");
      setUser({ token: data.token, username: data.username, role: data.role ?? "viewer" });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
