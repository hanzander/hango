"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Channel, Server } from "@/lib/types";
import type { PresenceUser } from "@/hooks/useServerPresence";
import type { NotificationLevel } from "@/lib/permissions";
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
  /** userId → media flags from LiveKit */
  voiceMedia?: Record<
    string,
    { micOn?: boolean; camOn?: boolean; screenOn?: boolean }
  >;
  speakingIds?: string[];
  unreadChannels?: Set<string>;
  mutedChannels?: Set<string>;
  serverMuted?: boolean;
  channelNotifLevels?: Record<string, NotificationLevel>;
  serverNotifLevel?: NotificationLevel;
  onCreateChannel?: () => void;
  onMuteChannel?: (channelId: string, mute: boolean) => void;
  onMuteServer?: (mute: boolean) => void;
  onSetChannelNotif?: (channelId: string, level: NotificationLevel) => void;
  onSetServerNotif?: (level: NotificationLevel) => void;
  onCopyInvite?: () => void;
  onOpenRoles?: () => void;
  onOpenSearch?: () => void;
  onOpenEmoji?: () => void;
  onOpenThreads?: () => void;
  onOpenInvite?: () => void;
  onMarkRead?: () => void;
  onEditTopic?: () => void;
  onJoinVoice?: (channel: Channel) => void;
};

export function ChannelList({
  server,
  channels,
  activeChannelId,
  onCloseMobile,
  hrefForChannel = (channel) => `/app/${server.id}/${channel.id}`,
  homeHref = "/app",
  voiceOccupants = {},
  voiceMedia = {},
  speakingIds = [],
  unreadChannels,
  mutedChannels,
  serverMuted,
  channelNotifLevels = {},
  serverNotifLevel = "all",
  onCreateChannel,
  onMuteChannel,
  onMuteServer,
  onSetChannelNotif,
  onSetServerNotif,
  onCopyInvite,
  onOpenRoles,
  onOpenSearch,
  onOpenEmoji,
  onOpenThreads,
  onOpenInvite,
  onMarkRead,
  onEditTopic,
  onJoinVoice,
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
    if (kind !== "text") return;
    if (!onMuteChannel && !onSetChannelNotif) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, channelId });
  }

  return (
    <aside className="relative z-20 flex min-h-0 flex-1 flex-col overflow-hidden border-r border-border bg-transparent">
      <div ref={serverMenuRef} className="relative shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setServerMenuOpen((o) => !o)}
          className={cn(
            "flex h-12 w-full items-center gap-2 px-3.5 text-left shadow-sm transition-colors hover:bg-bg-hover",
            serverMenuOpen && "bg-bg-hover",
          )}
          aria-expanded={serverMenuOpen}
          aria-haspopup="menu"
        >
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-text">
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
            className="hango-anim-pop absolute left-2 right-2 top-[calc(100%-2px)] z-50 overflow-hidden rounded-xl border border-border-strong bg-[#111] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
          >
            {onOpenSearch && (
              <MenuItem
                icon={<IconSearchSm />}
                label="Search"
                onClick={() => runAndClose(onOpenSearch)}
              />
            )}
            {onMarkRead && (
              <MenuItem
                icon={<IconCheck />}
                label="Mark as read"
                onClick={() => runAndClose(onMarkRead)}
              />
            )}
            {onEditTopic && (
              <MenuItem
                icon={<IconEdit />}
                label="Edit topic"
                onClick={() => runAndClose(onEditTopic)}
              />
            )}
            {onOpenThreads && (
              <MenuItem
                icon={<IconThread />}
                label="Threads"
                onClick={() => runAndClose(onOpenThreads)}
              />
            )}
            {onOpenEmoji && (
              <MenuItem
                icon={<IconEmoji />}
                label="Server emoji"
                onClick={() => runAndClose(onOpenEmoji)}
              />
            )}
            {onOpenRoles && (
              <MenuItem
                icon={<IconShield />}
                label="Roles"
                onClick={() => runAndClose(onOpenRoles)}
              />
            )}
            {onOpenInvite && (
              <MenuItem
                icon={<IconInvite />}
                label="Invite settings"
                onClick={() => runAndClose(onOpenInvite)}
              />
            )}
            {server.invite_code && (
              <MenuItem
                icon={<IconCopy />}
                label={copied ? "Invite copied" : "Copy invite"}
                onClick={() => {
                  void copyInvite();
                  setServerMenuOpen(false);
                }}
              />
            )}
            {(onSetServerNotif || onMuteServer) && (
              <>
                <div className="mx-2 my-2 border-t border-border" />
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Notifications
                </p>
                {(
                  [
                    ["all", "All messages"],
                    ["mentions", "Mentions only"],
                    ["nothing", "Nothing"],
                  ] as const
                ).map(([level, label]) => {
                  const active =
                    serverNotifLevel === level ||
                    (level === "nothing" &&
                      serverMuted &&
                      !onSetServerNotif);
                  return (
                    <MenuItem
                      key={level}
                      label={label}
                      active={active}
                      onClick={() => {
                        setServerMenuOpen(false);
                        if (onSetServerNotif) onSetServerNotif(level);
                        else if (onMuteServer)
                          onMuteServer(level === "nothing");
                      }}
                    />
                  );
                })}
              </>
            )}
            <div className="mx-2 my-2 border-t border-border" />
            <Link
              href={homeHref}
              role="menuitem"
              className="mx-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
              onClick={() => setServerMenuOpen(false)}
            >
              <span className="flex h-4 w-4 items-center justify-center text-xs">
                ←
              </span>
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
            const muted =
              (channelNotifLevels[channel.id] ??
                (mutedChannels?.has(channel.id) ? "nothing" : undefined)) ===
              "nothing";
            const notif =
              channelNotifLevels[channel.id] ??
              (mutedChannels?.has(channel.id) ? "nothing" : undefined);
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
                  {notif && notif !== "all" && (
                    <span className="ml-auto text-[9px] uppercase text-text-muted">
                      {notif === "mentions" ? "@" : "muted"}
                    </span>
                  )}
                  {muted && !notif && (
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
                  onClick={() => {
                    onCloseMobile?.();
                    onJoinVoice?.(channel);
                  }}
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
                    {occupants.map((user) => {
                      const media = voiceMedia[user.user_id];
                      const speaking = speakingIds.includes(user.user_id);
                      const muted = media ? media.micOn === false : false;
                      return (
                        <li
                          key={user.user_id}
                          className="flex items-center gap-1.5 py-0.5"
                        >
                          <div
                            className={cn(
                              "rounded-full transition-[box-shadow]",
                              speaking &&
                                "shadow-[0_0_0_2px_rgba(52,211,153,0.95)]",
                            )}
                          >
                            <Avatar
                              name={user.display_name}
                              src={user.avatar_url}
                              size="sm"
                              className="!h-5 !w-5 !text-[8px]"
                            />
                          </div>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[11px]",
                              speaking
                                ? "font-medium text-emerald-300"
                                : "text-text-secondary",
                            )}
                          >
                            {user.display_name}
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5 text-[9px] text-text-muted">
                            {media?.screenOn && (
                              <span
                                className="rounded bg-emerald-500/20 px-1 text-emerald-300"
                                title="Sharing screen"
                              >
                                live
                              </span>
                            )}
                            {media?.camOn && (
                              <span title="Camera on">cam</span>
                            )}
                            {muted && (
                              <span className="text-red-300" title="Muted">
                                mute
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
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

      {menu && (onMuteChannel || onSetChannelNotif) && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60]"
            aria-label="Close menu"
            onClick={() => setMenu(null)}
          />
          <div
            className="fixed z-[61] min-w-[180px] overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Notifications
            </p>
            {(
              [
                ["all", "All messages"],
                ["mentions", "Mentions only"],
                ["nothing", "Nothing"],
              ] as const
            ).map(([level, label]) => {
              const current =
                channelNotifLevels[menu.channelId] ??
                (mutedChannels?.has(menu.channelId) ? "nothing" : "all");
              return (
                <button
                  key={level}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text"
                  onClick={() => {
                    if (onSetChannelNotif) onSetChannelNotif(menu.channelId, level);
                    else if (onMuteChannel)
                      onMuteChannel(menu.channelId, level === "nothing");
                    setMenu(null);
                  }}
                >
                  {current === level ? "✓ " : ""}
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

function MenuItem({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary transition hover:bg-bg-hover hover:text-text",
        active && "bg-bg-hover text-text",
      )}
    >
      {icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
          {icon}
        </span>
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] text-emerald-400">
          {active ? "✓" : ""}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
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

function IconSearchSm() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="m5 12 5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M4 20h4L18 10l-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="m12 6 4 4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconThread() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconEmoji() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M8.5 14.5c1 1.5 2.5 2 3.5 2s2.5-.5 3.5-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconInvite() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.5 18c.8-2.5 2.8-4 5.5-4s4.7 1.5 5.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M17 8v6M14 11h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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
