"use client";

import { FormEvent, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/utils";
import { AuthMoment, type AuthMomentKind } from "./AuthMoment";

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

function PasswordField({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        minLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 pr-16 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted"
        placeholder="••••••••"
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:text-text"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function AuthForm({ mode, nextPath = "/app" }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [moment, setMoment] = useState<AuthMomentKind | null>(null);
  const destRef = useRef("/app");

  const configured = isSupabaseConfigured();

  const finishMoment = useCallback(() => {
    const dest = destRef.current;
    setMoment(null);
    router.push(dest);
    router.refresh();
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!configured) {
      setError("Log in isn’t available right now. Try again in a moment.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    setLoading(true);
    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          destRef.current = await routeAfterAuth(supabase, "/onboarding");
          setMoment("welcome-new");
          return;
        }

        setInfo("Check your email to confirm your account, then log in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
          throw new Error(
            "Wrong email or password. If you just signed up, confirm your email first (check inbox/spam).",
          );
        }
        if (msg.includes("email not confirmed")) {
          throw new Error(
            "Confirm your email before logging in. Check your inbox or spam folder.",
          );
        }
        throw signInError;
      }

      destRef.current = await routeAfterAuth(supabase, nextPath);
      setMoment("welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {moment && <AuthMoment kind={moment} onDone={finishMoment} />}

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
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-secondary">Password</span>
            {mode === "login" && (
              <Link
                href="/forgot-password"
                className="text-[11px] text-text-muted transition-colors hover:text-text"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordField
            value={password}
            onChange={setPassword}
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
          disabled={loading || Boolean(moment)}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
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
                Log in
              </Link>
            </>
          )}
        </p>
      </form>
    </>
  );
}
