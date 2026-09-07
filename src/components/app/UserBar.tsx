"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { UserStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type UserBarProps = {
  displayName: string;
  avatarUrl?: string | null;
  status?: UserStatus;
  customStatus?: string | null;
  compact?: boolean;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  onToggleCompact?: () => void;
};

const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
};

const STATUS_DOT: Record<UserStatus, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-400",
  dnd: "bg-red-500",
  invisible: "bg-text-muted",
};

export function UserBar({
  displayName,
  avatarUrl,
  status = "online",
  customStatus,
  compact,
  onSignOut,
  onOpenSettings,
  onToggleCompact,
}: UserBarProps) {
  const [mentionsOnly, setMentionsOnly] = useState(() => {
    try {
      return localStorage.getItem("hango-mentions-only") === "1";
    } catch {
      return false;
    }
  });

  return (
    <div className="flex min-w-0 items-center gap-1 border-t border-border bg-[#0d0d0d] px-2 py-1.5">
      <button
        type="button"
        onClick={onOpenSettings}
        className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-bg-hover"
        title="User settings"
      >
        <div className="relative shrink-0">
          <Avatar name={displayName} src={avatarUrl} size="sm" />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0d0d0d]",
              STATUS_DOT[status],
            )}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-[13px] font-semibold leading-tight text-text">
            {displayName}
          </p>
          <p className="truncate text-[11px] leading-tight text-text-muted">
            {customStatus || STATUS_LABEL[status]}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {onToggleCompact && (
          <IconBtn
            title={compact ? "Cozy messages" : "Compact messages"}
            onClick={onToggleCompact}
            active={compact}
          >
            <span className="text-[9px] font-bold tracking-wide">
              {compact ? "AZ" : "az"}
            </span>
          </IconBtn>
        )}
        <IconBtn
          title={
            mentionsOnly
              ? "Mentions only (click for all)"
              : "All messages (click for mentions only)"
          }
          active={mentionsOnly}
          onClick={() => {
            try {
              const next = !mentionsOnly;
              localStorage.setItem("hango-mentions-only", next ? "1" : "0");
              setMentionsOnly(next);
            } catch {
              /* ignore */
            }
          }}
        >
          <span className="text-xs font-bold">@</span>
        </IconBtn>
        {onOpenSettings && (
          <IconBtn title="User settings" onClick={onOpenSettings}>
            <SettingsIcon />
          </IconBtn>
        )}
        {onSignOut && (
          <IconBtn title="Sign out" onClick={onSignOut} danger>
            <LogoutIcon />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover hover:text-text",
        active && "bg-bg-hover text-text",
        danger && "hover:bg-rose-500/15 hover:text-rose-300",
      )}
    >
      {children}
    </button>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.6.7 1 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M15 12H3m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
