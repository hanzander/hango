"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { Server } from "@/lib/types";
import { initials } from "@/lib/utils";
import { ServerActionsModal } from "@/components/app/ServerActionsModal";
import { Avatar } from "@/components/ui/Avatar";
import { AuthMoment } from "@/components/auth/AuthMoment";

type ServersHomeProps = {
  displayName: string;
  avatarUrl?: string | null;
  servers: Server[];
  onSignOut?: () => void | Promise<void>;
};

export function ServersHome({
  displayName,
  avatarUrl,
  servers,
  onSignOut,
}: ServersHomeProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sayingBye, setSayingBye] = useState(false);

  const finishGoodbye = useCallback(async () => {
    await onSignOut?.();
  }, [onSignOut]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      {sayingBye && <AuthMoment kind="goodbye" onDone={finishGoodbye} />}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -12%, rgba(255,196,140,0.09), transparent 55%),
            radial-gradient(ellipse 45% 35% at 100% 10%, rgba(180,120,80,0.05), transparent 50%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,210,160,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,210,160,0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 70% 55% at 50% 20%, black, transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-text transition-opacity hover:opacity-80"
        >
          hango
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/app/friends"
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            Friends
          </Link>
          <div className="flex items-center gap-2.5">
            <Avatar name={displayName} src={avatarUrl} size="sm" />
            <span className="hidden max-w-[9rem] truncate text-sm text-text-secondary sm:inline">
              {displayName}
            </span>
          </div>
          {onSignOut && (
            <button
              type="button"
              onClick={() => setSayingBye(true)}
              className="text-sm text-text-muted transition-colors hover:text-text"
            >
              Log out
            </button>
          )}
        </div>
      </header>

      <main className="hango-servers-in relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-6 md:pt-10">
        <p className="text-sm text-text-muted">
          Hey {displayName.split(" ")[0] || displayName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text md:text-4xl">
          Your servers
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
          Pick a space to{" "}
          <span className="text-text">hango</span>
          <span className="text-text-secondary">ut</span>. Come back here anytime
          to switch.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {servers.map((server, i) => (
            <Link
              key={server.id}
              href={`/app/${server.id}`}
              className="hango-server-card group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border-strong bg-[#141312]/90 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-text-muted hover:bg-bg-subtle"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 70% at 0% 50%, rgba(255,196,140,0.07), transparent 55%)",
                }}
              />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-active text-sm font-medium text-text ring-1 ring-border transition-transform duration-200 group-hover:scale-[1.03]">
                {initials(server.name)}
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="truncate font-medium text-text">{server.name}</p>
                <p className="text-xs text-text-muted">Enter server</p>
              </div>
              <span className="relative text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text">
                →
              </span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hango-server-card flex items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-transparent p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-text-muted hover:bg-[#141312]/60"
            style={{ animationDelay: `${80 + servers.length * 60}ms` }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl text-text-muted ring-1 ring-border-strong">
              +
            </span>
            <div>
              <p className="font-medium text-text">Add a server</p>
              <p className="text-xs text-text-muted">Create or join with invite</p>
            </div>
          </button>
        </div>

        {servers.length === 0 && (
          <p className="mt-8 text-sm text-text-secondary">
            No servers yet — create one or join with an invite code.
          </p>
        )}
      </main>

      <ServerActionsModal
        open={open}
        onClose={() => setOpen(false)}
        onJoined={(serverId) => {
          router.push(`/app/${serverId}`);
          router.refresh();
        }}
      />
    </div>
  );
}
