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
      {/* Warm atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 55% at 50% -15%, rgba(255, 196, 140, 0.09), transparent 55%),
            radial-gradient(ellipse 50% 40% at 100% 20%, rgba(180, 120, 80, 0.06), transparent 50%),
            radial-gradient(ellipse 45% 35% at 0% 80%, rgba(120, 90, 70, 0.05), transparent 50%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,210,160,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,210,160,0.06) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 75% 65% at 50% 25%, black, transparent)",
        }}
      />
      <div
        aria-hidden
        className="hango-landing-orb pointer-events-none absolute left-1/2 top-[18%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,200,150,0.12), transparent 70%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <HangoLogo size={30} />
        </Link>
        <Link
          href="/login"
          className="text-sm text-text-secondary transition-colors hover:text-text"
        >
          Log in
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-6 pb-20 pt-10 md:pt-16">
        <div className="hango-landing-in max-w-2xl">
          <h1 className="text-[clamp(3.25rem,12vw,5.75rem)] font-semibold leading-[0.95] tracking-tight text-text">
            hang
            <span className="relative inline-block text-text-secondary">
              o
              <span
                aria-hidden
                className="absolute inset-0 rounded-full opacity-50 blur-md"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,210,170,0.35), transparent 70%)",
                }}
              />
            </span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary md:text-lg">
            <span className="text-text">hango</span>
            <span className="text-text-secondary">ut with your people.</span>
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="hango-interactive inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg"
            >
              Get started
            </Link>
          </div>
        </div>

        {/* Product preview — warmer, clearer shell */}
        <div className="hango-landing-preview relative mt-14 md:mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 -bottom-10 -top-6 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(255,190,130,0.08), transparent 65%)",
            }}
          />
          <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-[#121110]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm">
            <div className="flex h-11 items-center gap-2 border-b border-border/80 px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3a3530]" />
              <span className="ml-3 text-[11px] font-medium tracking-wide text-text-muted">
                hango — friends
              </span>
            </div>

            <div className="flex h-[280px] md:h-[340px]">
              {/* Server rail */}
              <div className="hango-rail-wash hidden w-[68px] shrink-0 flex-col items-center gap-2 border-r border-border py-3 sm:flex">
                <HangoMark size={40} className="rounded-xl" />
                <div className="h-px w-8 bg-border-strong" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-bg-active text-xs font-medium text-text ring-1 ring-border-strong">
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                  FZ
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-subtle text-xs text-text-muted">
                  +
                </div>
              </div>

              {/* Channels */}
              <div className="hango-sidebar-wash hidden w-48 shrink-0 flex-col border-r border-border p-3 sm:flex">
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

              {/* Chat */}
              <div className="hango-chat-wash flex min-w-0 flex-1 flex-col">
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-4">
                  <span className="text-text-muted">#</span>
                  <span className="text-sm font-semibold text-text">general</span>
                  <span className="hidden text-[11px] text-text-muted sm:inline">
                    · late night hang
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 px-4 py-4">
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
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-xs font-medium text-zinc-200 ring-1 ring-white/10">
                      H
                    </div>
                    <div className="min-w-0">
                      <div className="mb-0.5 flex h-5 items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-text">
                          you
                        </span>
                        <span className="text-[10px] text-text-muted">
                          9:43 PM
                        </span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-zinc-300">
                        already in lounge
                      </p>
                    </div>
                  </div>
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
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${accent} text-xs font-medium text-zinc-100 ring-1 ring-white/10`}
      >
        {initial}
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 flex h-5 items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <span className="text-[10px] text-text-muted">{time}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-300">{body}</p>
      </div>
    </div>
  );
}
