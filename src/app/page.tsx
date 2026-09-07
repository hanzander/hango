import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255,255,255,0.08), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(255,255,255,0.04), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-6 pb-24 pt-16 md:pt-24">
        <p className="mb-4 text-sm text-text-secondary">Chat, simplified.</p>
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-text md:text-7xl">
          hang<span className="text-text-muted">o</span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary md:text-lg">
          A clean, dark space for servers, channels, and realtime conversation —
          built for the web first.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Create account
          </Link>
          <Link
            href="/app/demo"
            className="rounded-lg border border-border-strong px-5 py-2.5 text-sm text-text-secondary transition-colors hover:border-text-muted hover:text-text"
          >
            Preview UI
          </Link>
        </div>

        {/* Product preview strip */}
        <div className="mt-20 overflow-hidden rounded-xl border border-border-strong bg-bg-elevated shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="flex h-10 items-center gap-2 border-b border-border px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="ml-3 text-xs text-text-muted">hango.app</span>
          </div>
          <div className="flex h-56 md:h-72">
            <div className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-bg py-3 sm:flex">
              <div className="h-9 w-9 rounded-xl bg-accent" />
              <div className="h-9 w-9 rounded-2xl bg-bg-subtle ring-1 ring-border" />
            </div>
            <div className="hidden w-44 shrink-0 flex-col border-r border-border bg-sidebar p-3 sm:flex">
              <div className="mb-3 h-3 w-24 rounded bg-bg-active" />
              <div className="space-y-1.5">
                <div className="h-7 rounded-md bg-bg-active" />
                <div className="h-7 rounded-md bg-transparent" />
                <div className="h-7 rounded-md bg-transparent" />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col p-4">
              <div className="mb-4 h-3 w-20 rounded bg-bg-active" />
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-bg-subtle" />
                  <div className="space-y-1.5 pt-1">
                    <div className="h-2.5 w-16 rounded bg-bg-active" />
                    <div className="h-2.5 w-48 max-w-full rounded bg-bg-subtle" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-bg-subtle" />
                  <div className="space-y-1.5 pt-1">
                    <div className="h-2.5 w-20 rounded bg-bg-active" />
                    <div className="h-2.5 w-64 max-w-full rounded bg-bg-subtle" />
                  </div>
                </div>
              </div>
              <div className="mt-auto h-10 rounded-lg border border-border-strong bg-bg" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
