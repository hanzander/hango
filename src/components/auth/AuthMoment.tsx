"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AuthMomentKind = "welcome" | "welcome-new" | "goodbye";

type AuthMomentProps = {
  kind: AuthMomentKind;
  onDone: () => void;
  durationMs?: number;
};

const COPY: Record<AuthMomentKind, { title: ReactNode; sub: ReactNode }> = {
  welcome: {
    title: (
      <>
        Welcome back to <span className="text-text">hango</span>
      </>
    ),
    sub: "Take a breath — your people are waiting.",
  },
  "welcome-new": {
    title: (
      <>
        Welcome to <span className="text-text">hango</span>
      </>
    ),
    sub: "You’re in. Let’s find your people.",
  },
  goodbye: {
    title: "See you soon",
    sub: (
      <>
        Come back whenever — <span className="text-text-secondary">hango</span>
        ut awaits.
      </>
    ),
  },
};

export function AuthMoment({
  kind,
  onDone,
  durationMs = 1800,
}: AuthMomentProps) {
  const [leaving, setLeaving] = useState(false);
  const copy = COPY[kind];

  useEffect(() => {
    const fadeAt = window.setTimeout(() => setLeaving(true), durationMs - 420);
    const doneAt = window.setTimeout(onDone, durationMs);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(doneAt);
    };
  }, [durationMs, onDone]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-bg transition-opacity duration-[400ms]",
        leaving ? "opacity-0" : "opacity-100",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="hango-moment-orb pointer-events-none absolute left-1/2 top-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,200,150,0.16), transparent 68%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 45%, rgba(255,196,140,0.08), transparent 60%)",
        }}
      />

      <div className="hango-moment-copy relative z-10 px-6 text-center">
        <p className="mb-4 text-sm font-medium tracking-[0.2em] text-text-muted">
          HANGO
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-text-secondary md:text-3xl">
          {copy.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-muted">
          {copy.sub}
        </p>
        <div className="mx-auto mt-8 flex justify-center gap-1.5" aria-hidden>
          <span className="hango-moment-dot h-1.5 w-1.5 rounded-full bg-text-muted/80" />
          <span className="hango-moment-dot h-1.5 w-1.5 rounded-full bg-text-muted/80 [animation-delay:120ms]" />
          <span className="hango-moment-dot h-1.5 w-1.5 rounded-full bg-text-muted/80 [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}
