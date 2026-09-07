"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/utils";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isSupabaseConfigured()) {
      setError("Reset isn’t available right now. Try again in a moment.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        },
      );
      if (resetError) throw resetError;
      setInfo("If that email exists, we sent a reset link. Check inbox and spam.");
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
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-text-secondary">
        <Link
          href="/login"
          className="text-text underline-offset-4 hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </form>
  );
}
