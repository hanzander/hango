"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/utils";
import {
  forgetEmail,
  loadRememberedEmails,
  rememberEmail,
} from "@/lib/remembered-accounts";
import { AuthMoment, type AuthMomentKind } from "./AuthMoment";
import { cn } from "@/lib/utils";

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

function EmailField({
  value,
  onChange,
  remembered,
  onForget,
  allowPicker,
}: {
  value: string;
  onChange: (value: string) => void;
  remembered: string[];
  onForget: (email: string) => void;
  allowPicker: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showPicker = allowPicker && remembered.length > 0;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="email"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (showPicker) setOpen(true);
          }}
          className={cn(
            "w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted",
            showPicker && "pr-10",
          )}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {showPicker && (
          <button
            type="button"
            aria-label={open ? "Hide saved accounts" : "Show saved accounts"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
          >
            <svg
              viewBox="0 0 20 20"
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path
                d="M5 7.5 10 12.5 15 7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {showPicker && open && (
        <div
          role="listbox"
          className="hango-anim-pop absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-border-strong bg-[#161412] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Saved accounts
          </p>
          {remembered.map((account) => (
            <div
              key={account}
              className="flex items-center gap-1 px-1.5"
              role="option"
              aria-selected={account === value.trim().toLowerCase()}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(account);
                  setOpen(false);
                }}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-white/[0.06]",
                  account === value.trim().toLowerCase() && "bg-white/[0.05]",
                )}
              >
                {account}
              </button>
              <button
                type="button"
                title="Remove saved account"
                aria-label={`Forget ${account}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onForget(account);
                }}
                className="shrink-0 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="mt-0.5 w-full border-t border-border px-3.5 py-2 text-left text-xs text-text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
          >
            Use a different email
          </button>
        </div>
      )}
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
  const [remembered, setRemembered] = useState<string[]>([]);
  const destRef = useRef("/app");

  const configured = isSupabaseConfigured();

  useEffect(() => {
    const saved = loadRememberedEmails();
    setRemembered(saved);
    if (mode === "login" && saved[0] && !email) {
      setEmail(saved[0]);
    }
    // Only hydrate once on mount for this mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const finishMoment = useCallback(() => {
    const dest = destRef.current;
    setMoment(null);
    router.push(dest);
    router.refresh();
  }, [router]);

  function handleForget(account: string) {
    forgetEmail(account);
    const next = loadRememberedEmails();
    setRemembered(next);
    if (email.trim().toLowerCase() === account) {
      setEmail(next[0] ?? "");
    }
  }

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

        rememberEmail(cleanEmail);
        setRemembered(loadRememberedEmails());

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

      rememberEmail(cleanEmail);
      setRemembered(loadRememberedEmails());
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
          <EmailField
            value={email}
            onChange={setEmail}
            remembered={remembered}
            onForget={handleForget}
            allowPicker={mode === "login"}
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
