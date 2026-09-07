"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Server } from "@/lib/types";
import { initials } from "@/lib/utils";
import { ServerActionsModal } from "@/components/app/ServerActionsModal";
import { Avatar } from "@/components/ui/Avatar";

type ServersHomeProps = {
  displayName: string;
  avatarUrl?: string | null;
  servers: Server[];
  onSignOut?: () => void;
};

export function ServersHome({
  displayName,
  avatarUrl,
  servers,
  onSignOut,
}: ServersHomeProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, rgba(255,255,255,0.07), transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/app/friends"
            className="text-xs text-text-muted hover:text-text"
          >
            Friends
          </Link>
          <div className="flex items-center gap-2">
            <Avatar name={displayName} src={avatarUrl} size="sm" />
            <span className="hidden text-sm text-text-secondary sm:inline">
              {displayName}
            </span>
          </div>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs text-text-muted hover:text-text"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Your servers
        </h1>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          Pick a space to enter. Leave a server anytime to return here and switch.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {servers.map((server) => (
            <Link
              key={server.id}
              href={`/app/${server.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-border-strong bg-bg-elevated p-4 transition-colors hover:border-text-muted hover:bg-bg-subtle"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-active text-sm font-medium text-text ring-1 ring-border transition-transform group-hover:scale-[1.02]">
                {initials(server.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text">{server.name}</p>
                <p className="text-xs text-text-muted">Enter server</p>
              </div>
              <span className="text-text-muted transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-transparent p-4 text-left transition-colors hover:border-text-muted hover:bg-bg-elevated"
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
          <p className="mt-6 text-sm text-text-secondary">
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
