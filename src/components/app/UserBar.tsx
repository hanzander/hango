"use client";

import { Avatar } from "@/components/ui/Avatar";

type UserBarProps = {
  displayName: string;
  avatarUrl?: string | null;
  onSignOut?: () => void;
};

export function UserBar({ displayName, avatarUrl, onSignOut }: UserBarProps) {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-bg-elevated px-2 py-2">
      <Avatar name={displayName} src={avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text">{displayName}</p>
        <p className="truncate text-[10px] text-text-muted">Online</p>
      </div>
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
