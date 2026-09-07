"use client";

import Link from "next/link";
import { useState } from "react";
import type { Channel, Server } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChannelListProps = {
  server: Server;
  channels: Channel[];
  activeChannelId?: string;
  onCloseMobile?: () => void;
  hrefForChannel?: (channel: Channel) => string;
  homeHref?: string;
};

export function ChannelList({
  server,
  channels,
  activeChannelId,
  onCloseMobile,
  hrefForChannel = (channel) => `/app/${server.id}/${channel.id}`,
  homeHref = "/app",
}: ChannelListProps) {
  const [copied, setCopied] = useState(false);

  const textChannels = channels.filter((c) => (c.kind ?? "text") === "text");
  const voiceChannels = channels.filter((c) => c.kind === "voice");

  async function copyInvite() {
    if (!server.invite_code) return;
    await navigator.clipboard.writeText(server.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 flex-col justify-center gap-0.5 border-b border-border px-4">
        <h2 className="truncate text-sm font-semibold tracking-tight text-text">
          {server.name}
        </h2>
        <Link
          href={homeHref}
          className="w-fit text-[11px] text-text-muted transition-colors hover:text-text"
        >
          ← Leave server
        </Link>
      </div>

      <div className="hango-scroll flex-1 overflow-y-auto px-2 py-3">
        {server.invite_code && (
          <button
            type="button"
            onClick={copyInvite}
            className="mb-4 w-full rounded-lg bg-bg px-2.5 py-2 text-left text-[11px] text-text-secondary ring-1 ring-border transition-colors hover:text-text"
            title="Copy invite code"
          >
            Invite{" "}
            <span className="font-mono text-text">
              {copied ? "copied" : server.invite_code}
            </span>
          </button>
        )}

        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Text
        </p>
        <ul className="mb-4 space-y-0.5">
          {textChannels.map((channel) => {
            const active = channel.id === activeChannelId;
            return (
              <li key={channel.id}>
                <Link
                  href={hrefForChannel(channel)}
                  onClick={onCloseMobile}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text",
                    active && "bg-bg-active text-text",
                  )}
                >
                  <span className="text-text-muted">#</span>
                  <span className="truncate">{channel.name}</span>
                </Link>
              </li>
            );
          })}
          {textChannels.length === 0 && (
            <li className="px-2 text-xs text-text-muted">No text channels</li>
          )}
        </ul>

        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Voice
        </p>
        <ul className="space-y-0.5">
          {voiceChannels.map((channel) => {
            const active = channel.id === activeChannelId;
            return (
              <li key={channel.id}>
                <Link
                  href={hrefForChannel(channel)}
                  onClick={onCloseMobile}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text",
                    active && "bg-emerald-500/10 text-emerald-300",
                  )}
                >
                  <VoiceIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{channel.name}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </Link>
              </li>
            );
          })}
          {voiceChannels.length === 0 && (
            <li className="px-2 text-xs text-text-muted">No voice channels</li>
          )}
        </ul>
      </div>
    </aside>
  );
}

function VoiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
    </svg>
  );
}
