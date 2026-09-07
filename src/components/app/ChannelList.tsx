"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Channel, Server } from "@/lib/types";
import type { PresenceUser } from "@/hooks/useServerPresence";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

type ChannelListProps = {
  server: Server;
  channels: Channel[];
  activeChannelId?: string;
  onCloseMobile?: () => void;
  hrefForChannel?: (channel: Channel) => string;
  homeHref?: string;
  voiceOccupants?: Record<string, PresenceUser[]>;
  unreadChannels?: Set<string>;
  mutedChannels?: Set<string>;
  serverMuted?: boolean;
  onCreateChannel?: () => void;
  onMuteChannel?: (channelId: string, mute: boolean) => void;
  onMuteServer?: (mute: boolean) => void;
  onCopyInvite?: () => void;
  onOpenRoles?: () => void;
  onOpenSearch?: () => void;
  onOpenEmoji?: () => void;
  onOpenThreads?: () => void;
  onOpenInvite?: () => void;
  onMarkRead?: () => void;
  onEditTopic?: () => void;
};

export function ChannelList({
  server,
  channels,
  activeChannelId,
  onCloseMobile,
  hrefForChannel = (channel) => `/app/${server.id}/${channel.id}`,
  homeHref = "/app",
  voiceOccupants = {},
  unreadChannels,
  mutedChannels,
  serverMuted,
  onCreateChannel,
  onMuteChannel,
  onMuteServer,
  onCopyInvite,
  onOpenRoles,
  onOpenSearch,
  onOpenEmoji,
  onOpenThreads,
  onOpenInvite,
  onMarkRead,
  onEditTopic,
}: ChannelListProps) {
  const [copied, setCopied] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const serverMenuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    channelId: string;
  } | null>(null);

  const textChannels = channels.filter((c) => (c.kind ?? "text") === "text");
  const voiceChannels = channels.filter((c) => c.kind === "voice");

  useEffect(() => {
    if (!serverMenuOpen) return;
    function onDoc(e: Event) {
      if (
        serverMenuRef.current &&
        !serverMenuRef.current.contains(e.target as Node)
      ) {
        setServerMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setServerMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [serverMenuOpen]);

  async function copyInvite() {
    if (!server.invite_code) return;
    await navigator.clipboard.writeText(server.invite_code);
    setCopied(true);
    onCopyInvite?.();
    setTimeout(() => setCopied(false), 1500);
  }

  function runAndClose(fn?: () => void) {
    setServerMenuOpen(false);
    fn?.();
  }

  function onChannelContext(
    e: MouseEvent,
    channelId: string,
    kind: "text" | "voice",
  ) {
    if (kind !== "text" || !onMuteChannel) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, channelId });
  }

  return (
    <aside className="relative z-20 flex h-full w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar">
      <div ref={serverMenuRef} className="relative shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setServerMenuOpen((o) => !o)}
          className={cn(
            "flex h-12 w-full items-center gap-2 px-4 text-left transition-colors hover:bg-bg-hover",
            serverMenuOpen && "bg-bg-hover",
          )}
          aria-expanded={serverMenuOpen}
          aria-haspopup="menu"
        >
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-text">
            {server.name}
          </h2>
          <ChevronIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-text-muted transition-transform",
              serverMenuOpen && "rotate-180",
            )}
          />
        </button>

        {serverMenuOpen && (
          <div
            role="menu"
            className="absolute left-2 right-2 top-[calc(100%-4px)] z-50 overflow-hidden rounded-lg border border-border bg-bg-elevated py-1.5 shadow-xl"
          >
            {onOpenSearch && (
              <MenuItem
                label="Search"
                onClick={() => runAndClose(onOpenSearch)}
              />
            )}
            {onMarkRead && (
              <MenuItem
                label="Mark as read"
                onClick={() => runAndClose(onMarkRead)}
              />
            )}
            {onEditTopic && (
              <MenuItem
                label="Edit topic"
                onClick={() => runAndClose(onEditTopic)}
              />
            )}
            {onOpenThreads && (
              <MenuItem
                label="Threads"
                onClick={() => runAndClose(onOpenThreads)}
              />
            )}
            {onOpenEmoji && (
              <MenuItem
                label="Server emoji"
                onClick={() => runAndClose(onOpenEmoji)}
              />
            )}
            {onOpenRoles && (
              <MenuItem
                label="Roles"
                onClick={() => runAndClose(onOpenRoles)}
              />
            )}
            {onOpenInvite && (
              <MenuItem
                label="Invite settings"
                onClick={() => runAndClose(onOpenInvite)}
              />
            )}
            {server.invite_code && (
              <MenuItem
                label={copied ? "Invite copied" : "Copy invite"}
                onClick={() => {
                  void copyInvite();
                  setServerMenuOpen(false);
                }}
              />
            )}
            {onMuteServer && (
              <MenuItem
                label={serverMuted ? "Unmute server" : "Mute server"}
                onClick={() => {
                  setServerMenuOpen(false);
                  onMuteServer(!serverMuted);
                }}
              />
            )}
            <div className="my-1 border-t border-border" />
            <Link
              href={homeHref}
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-xs text-rose-400 hover:bg-bg-hover"
              onClick={() => setServerMenuOpen(false)}
            >
              Leave server
            </Link>
          </div>
        )}
      </div>

      <div className="hango-scroll flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Text
          </p>
          {onCreateChannel && (
            <button
              type="button"
              onClick={onCreateChannel}
              className="text-xs text-text-muted hover:text-text"
              title="Create Channel"
            >
              +
            </button>
          )}
        </div>
        <ul className="mb-4 space-y-0.5">
          {textChannels.map((channel) => {
            const active = channel.id === activeChannelId;
            const unread = unreadChannels?.has(channel.id);
            const muted = mutedChannels?.has(channel.id);
            return (
              <li key={channel.id}>
                <Link
                  href={hrefForChannel(channel)}
                  onClick={onCloseMobile}
                  onContextMenu={(e) =>
                    onChannelContext(e, channel.id, "text")
                  }
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text",
                    active && "bg-bg-active text-text",
                    unread && !active && "font-semibold text-text",
                    muted && "opacity-50",
                  )}
                >
                  {unread && !active && (
                    <span className="absolute left-0 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r bg-text" />
                  )}
                  <span className="text-text-muted">#</span>
                  <span className="truncate">{channel.name}</span>
                  {muted && (
                    <span className="ml-auto text-[9px] uppercase text-text-muted">
                      muted
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {textChannels.length === 0 && (
            <li className="px-2 text-xs text-text-muted">No text channels</li>
          )}
        </ul>

        <div className="mb-1.5 flex items-center justify-between px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Voice
          </p>
          {onCreateChannel && (
            <button
              type="button"
              onClick={onCreateChannel}
              className="text-xs text-text-muted hover:text-text"
              title="Create Channel"
            >
              +
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {voiceChannels.map((channel) => {
            const active = channel.id === activeChannelId;
            const occupants = voiceOccupants[channel.id] ?? [];
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
                  {occupants.length > 0 && (
                    <span className="ml-auto text-[10px] text-emerald-400/80">
                      {occupants.length}
                    </span>
                  )}
                </Link>
                {occupants.length > 0 && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-border py-0.5 pl-3">
                    {occupants.map((user) => (
                      <li
                        key={user.user_id}
                        className="flex items-center gap-1.5 py-0.5"
                      >
                        <Avatar
                          name={user.display_name}
                          src={user.avatar_url}
                          size="sm"
                          className="!h-5 !w-5 !text-[8px]"
                        />
                        <span className="truncate text-[11px] text-text-secondary">
                          {user.display_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {voiceChannels.length === 0 && (
            <li className="px-2 text-xs text-text-muted">No voice channels</li>
          )}
        </ul>
      </div>

      {menu && onMuteChannel && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60]"
            aria-label="Close menu"
            onClick={() => setMenu(null)}
          />
          <div
            className="fixed z-[61] min-w-[160px] overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text"
              onClick={() => {
                const muted = mutedChannels?.has(menu.channelId);
                onMuteChannel(menu.channelId, !muted);
                setMenu(null);
              }}
            >
              {mutedChannels?.has(menu.channelId)
                ? "Unmute Channel"
                : "Mute Channel"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function MenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text"
    >
      {label}
    </button>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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
