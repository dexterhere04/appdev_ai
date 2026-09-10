"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Loader2 } from "lucide-react";

export function AuthGate() {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setFormError(null);
    clearError();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const visibleError = formError ?? error;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] text-gray-200">
      <div className="w-full max-w-sm px-6">
        <div className="flex justify-center mb-8">
          <Logo className="scale-110" showText />
        </div>

        <div className="bg-[#111115] border border-gray-800 rounded-xl p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-gray-100 mb-1">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-gray-500 mb-5">
            {mode === "login"
              ? "Sign in to open your projects."
              : "Sign up to start building Flutter apps with AI."}
          </p>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40"
            />
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40"
            />

            {mode === "register" && (
              <p className="text-xs text-gray-500">
                Password must be at least 8 characters.
              </p>
            )}

            {visibleError && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                {visibleError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>

          <div className="mt-5 flex text-sm justify-center gap-1 text-gray-400">
            {mode === "login" ? (
              <>
                <span>New here?</span>
                <button
                  onClick={() => switchMode("register")}
                  className="text-blue-400 hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <span>Already have an account?</span>
                <button
                  onClick={() => switchMode("login")}
                  className="text-blue-400 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
