"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { errorBox, fieldClass, primaryButton } from "./ui";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  useEffect(() => {
    if (!loading && user) router.replace("/tasks");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
      router.replace("/tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-2 text-sm font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          Task Manager
        </div>

        <h1 className="font-serif text-4xl leading-tight text-ink">
          {isRegister ? "Let's get you settled in." : "Welcome back."}
        </h1>
        <p className="mt-3 text-muted">
          {isRegister
            ? "A quiet place to keep track of what matters."
            : "Pick up right where you left off."}
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-4">
          {isRegister && (
            <label className="block space-y-1.5">
              <span className="text-sm text-ink">Your name</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                minLength={2}
                required
              />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Email</span>
            <input
              className={fieldClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-ink">Password</span>
            <input
              className={fieldClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 8 : undefined}
              required
            />
            {isRegister && <span className="text-xs text-muted">At least 8 characters.</span>}
          </label>

          {error && <p className={errorBox}>{error}</p>}

          <button type="submit" disabled={submitting} className={`${primaryButton} w-full`}>
            {submitting ? "One moment…" : isRegister ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-8 text-sm text-muted">
          {isRegister ? "Already have an account? " : "New here? "}
          <Link
            href={isRegister ? "/login" : "/register"}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {isRegister ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
