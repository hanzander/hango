import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";
import { HangoLogo, HangoMark } from "@/components/brand/HangoLogo";

export default async function HomePage() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_complete")
          .eq("id", user.id)
          .maybeSingle();

        if (profile && !profile.onboarding_complete) {
          redirect("/onboarding");
        }
        redirect("/app");
      }
    } catch {
      // Missing env / auth error — show marketing page
    }
  }

  return (
    <div className="hango-landing relative min-h-dvh overflow-hidden bg-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 15% -10%, rgba(255, 196, 140, 0.11), transparent 55%),
            radial-gradient(ellipse 55% 45% at 95% 30%, rgba(180, 120, 80, 0.07), transparent 50%),
            radial-gradient(ellipse 40% 30% at 50% 100%, rgba(120, 90, 70, 0.06), transparent 55%)
          `,
        }}
      />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-end px-6 py-5 md:px-8">
        <nav className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm text-text-secondary transition-colors hover:text-text"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
          >
            Sign up
          </Link>
        </nav>
      </header>

      {/* One composition: copy + live product feel */}
      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-4.5rem)] w-full max-w-6xl items-center gap-10 px-6 pb-10 pt-6 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] md:gap-12 md:px-8 md:pb-14 md:pt-4">
        <div className="hango-landing-in relative z-10 max-w-lg">
          <HangoLogo size={36} className="mb-6" />
          <h1 className="max-w-md text-[clamp(1.35rem,3.6vw,1.85rem)] font-medium leading-snug tracking-tight text-text-secondary">
            a calm place to{" "}
            <span className="font-semibold text-[#E0A86A]">hango</span>
            ut with your people
          </h1>

          <div className="relative mt-10">
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 flex select-none flex-col items-start"
            >
              <p
                className="-mb-0.5 rotate-[-6deg] text-[1.5rem] leading-none tracking-wide text-zinc-400/80"
                style={{ fontFamily: "var(--font-hand), cursive" }}
              >
                come hang
              </p>
              <svg
                width="78"
                height="36"
                viewBox="0 0 78 36"
                fill="none"
                className="ml-3 text-zinc-400/70"
              >
                <path
                  d="M4 4c14 2 28 6 42 16 8 5 16 10 24 12"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M58 22c6 4 10 7 12 10"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M62 18c6 5 10 10 10 14"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="hango-interactive inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="inline-flex rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-white/[0.04] hover:text-text"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>

        <div className="hango-landing-preview relative min-w-0">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 opacity-80"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255,190,130,0.1), transparent 65%)",
            }}
          />
          <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-[#121110] shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
            <div className="flex h-11 items-center gap-2 border-b border-border/80 px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="ml-3 text-[11px] font-medium tracking-wide text-text-muted">
                Friends Zone · #general
              </span>
            </div>

            <div className="flex h-[320px] sm:h-[380px] md:h-[min(52vh,420px)]">
              <div className="hango-rail-wash hidden w-[64px] shrink-0 flex-col items-center gap-2 border-r border-border py-3 sm:flex">
                <HangoMark size={40} className="rounded-xl" />
                <div className="h-px w-8 bg-border-strong" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-bg-active text-[10px] font-medium text-text ring-1 ring-border-strong">
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                  FZ
                </div>
              </div>

              <div className="hango-sidebar-wash hidden w-[160px] shrink-0 flex-col border-r border-border p-3 md:flex">
                <p className="mb-3 truncate px-2 text-[11px] font-semibold tracking-wide text-text">
                  Friends Zone
                </p>
                <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Text
                </p>
                <div className="mb-0.5 flex items-center gap-1.5 rounded-md bg-bg-active px-2 py-1.5 text-xs text-text">
                  <span className="text-text-muted">#</span> general
                </div>
                <div className="mb-3 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted">
                  <span>#</span> random
                </div>
                <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Voice
                </p>
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-secondary">
                  <span className="text-text-muted">◉</span> Lounge
                </div>
              </div>

              <div className="hango-chat-wash flex min-w-0 flex-1 flex-col">
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-4">
                  <span className="text-text-muted">#</span>
                  <span className="text-sm font-semibold text-text">general</span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col justify-end gap-3.5 px-4 py-4">
                  <PreviewMessage
                    initial="M"
                    name="Maya"
                    time="9:41 PM"
                    body="anyone free to hop in voice?"
                    accent="from-stone-600 to-stone-700"
                  />
                  <PreviewMessage
                    initial="J"
                    name="Jules"
                    time="9:42 PM"
                    body="omw — bring snacks"
                    accent="from-amber-800/80 to-stone-700"
                  />
                  <PreviewMessage
                    initial="H"
                    name="you"
                    time="9:43 PM"
                    body="already in lounge"
                    accent="from-zinc-600 to-zinc-800"
                  />
                </div>

                <div className="shrink-0 border-t border-border/60 px-4 py-3">
                  <div className="flex h-10 items-center rounded-xl border border-border-strong bg-black/25 px-3 text-xs text-text-muted">
                    Message #general
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PreviewMessage({
  initial,
  name,
  time,
  body,
  accent,
}: {
  initial: string;
  name: string;
  time: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${accent} text-[11px] font-medium text-zinc-100 ring-1 ring-white/10`}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <span className="text-[10px] text-text-muted">{time}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-300">{body}</p>
      </div>
    </div>
  );
}
