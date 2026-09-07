"use client";

import Link from "next/link";
import type { Server } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

type ServerRailProps = {
  servers: Server[];
  activeServerId?: string;
  hrefForServer?: (server: Server) => string;
  onAddServer?: () => void;
};

export function ServerRail({
  servers,
  activeServerId,
  hrefForServer = (server) => `/app/${server.id}`,
  onAddServer,
}: ServerRailProps) {
  return (
    <aside className="flex h-full w-[68px] shrink-0 flex-col items-center gap-2 border-r border-border bg-rail py-3">
      <Link
        href="/"
        className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-sm font-semibold tracking-tight text-accent-fg transition-all hover:rounded-xl"
        title="Hango home"
      >
        H
      </Link>
      <div className="h-px w-8 bg-border-strong" />
      <div className="hango-scroll flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
        {servers.map((server) => {
          const active = server.id === activeServerId;
          return (
            <Link
              key={server.id}
              href={hrefForServer(server)}
              title={server.name}
              className="group relative flex w-full justify-center"
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-0 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all",
                  active ? "h-9" : "group-hover:h-5",
                )}
              />
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-subtle text-xs font-medium text-text transition-all hover:rounded-xl hover:bg-bg-hover",
                  active && "rounded-xl bg-bg-active ring-1 ring-border-strong",
                )}
              >
                {initials(server.name)}
              </span>
            </Link>
          );
        })}
        {onAddServer && (
          <button
            type="button"
            onClick={onAddServer}
            title="Add a server"
            className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-border-strong text-lg text-text-muted transition-all hover:rounded-xl hover:border-text-muted hover:text-text"
          >
            +
          </button>
        )}
      </div>
    </aside>
  );
}
