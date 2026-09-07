"use client";

import { useEffect } from "react";
import type { Profile, UserStatus } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

type UserProfilePopoutProps = {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  anchor?: "center" | "right";
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

export function UserProfilePopout({
  open,
  profile,
  onClose,
}: UserProfilePopoutProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !profile) return null;

  const status = profile.status ?? "online";

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <div className="h-20 bg-gradient-to-br from-emerald-600/40 via-bg to-bg" />
        <div className="relative px-5 pb-5">
          <div className="-mt-10 mb-3 inline-block rounded-full ring-4 ring-bg-elevated">
            <div className="relative">
              <Avatar name={profile.display_name} src={profile.avatar_url} size="xl" />
              <span
                className={cn(
                  "absolute bottom-1 right-1 h-4 w-4 rounded-full ring-2 ring-bg-elevated",
                  STATUS_DOT[status],
                )}
              />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-text">{profile.display_name}</h2>
          {profile.username && (
            <p className="text-xs text-text-muted">@{profile.username}</p>
          )}
          <p className="mt-1 text-xs text-text-secondary">
            {STATUS_LABEL[status]}
            {profile.custom_status ? ` — ${profile.custom_status}` : ""}
          </p>
          {profile.bio && (
            <div className="mt-4 rounded-lg border border-border bg-bg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                About Me
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                {profile.bio}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-border-strong py-2 text-sm text-text-secondary hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
