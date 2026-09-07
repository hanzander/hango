"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { UserStatus } from "@/lib/types";

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
  return (
    <div className="flex items-center gap-1 border-t border-border bg-bg-elevated px-2 py-2">
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-bg-hover"
        title="User settings"
      >
        <Avatar name={displayName} src={avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-text">{displayName}</p>
          <p className="truncate text-[10px] text-text-muted">
            {customStatus || STATUS_LABEL[status]}
          </p>
        </div>
      </button>
      {onToggleCompact && (
        <button
          type="button"
          onClick={onToggleCompact}
          className="rounded-md px-1.5 py-1 text-[10px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
          title="Toggle compact messages"
        >
          {compact ? "Cozy" : "Compact"}
        </button>
      )}
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
          title="User settings"
          aria-label="User settings"
        >
          <SettingsIcon />
        </button>
      )}
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          Sign out
        </button>
      )}
    </div>
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
