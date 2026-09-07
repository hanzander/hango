"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/utils";

type AuthFormProps = {
  mode: "login" | "signup";
  nextPath?: string;
};

async function routeAfterAuth(
  supabase: ReturnType<typeof createClient>,
  fallback: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_complete) return "/onboarding";
  return fallback.startsWith("/app") || fallback === "/onboarding"
    ? fallback
    : "/app";
}

export function AuthForm({ mode, nextPath = "/app" }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!configured) {
      setError("Sign-in isn’t available right now. Try again in a moment.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          const dest = await routeAfterAuth(supabase, "/onboarding");
          router.push(dest);
          router.refresh();
          return;
        }

        setInfo("Check your email to confirm your account, then sign in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const dest = await routeAfterAuth(supabase, nextPath);
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Password</span>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted"
          placeholder="••••••••"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {info && <p className="text-sm text-text-secondary">{info}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="text-center text-sm text-text-secondary">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link
              href="/signup"
              className="text-text underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-text underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
