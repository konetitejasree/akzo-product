"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "akzo-product-auth";
const AuthContext = createContext(null);

function roleFromEmail(email) {
  return email.trim().toLowerCase() === "admin@gmail.com" ? "admin" : "user";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (user) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, [hydrated, user]);

  const login = (email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const nextUser = {
      email: normalizedEmail,
      role: roleFromEmail(normalizedEmail),
    };
    setUser(nextUser);
    return nextUser;
  };

  const logout = () => {
    setUser(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const value = useMemo(
    () => ({
      user,
      hydrated,
      login,
      logout,
      isAdmin: user?.role === "admin",
    }),
    [hydrated, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ProtectedRoute({ children, allowRoles = ["user", "admin"] }) {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    if (!user) {
      router.replace("/");
      return;
    }

    if (!allowRoles.includes(user.role)) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
      return;
    }

    setAllowed(true);
  }, [allowRoles, hydrated, router, user]);

  if (!hydrated || !allowed) {
    return (
      <main className="auth-shell">
        <div className="glass-panel rounded-lg px-8 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">Loading workspace...</p>
          <p className="mt-2 text-sm text-slate-500">
            Checking your demo access and preparing the right screen.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
