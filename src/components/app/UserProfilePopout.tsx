"use client";

import { useEffect, useState } from "react";
import type { Profile, ServerRole, UserStatus } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

type UserProfilePopoutProps = {
  open: boolean;
  profile: Profile | null;
  onClose: () => void;
  isOwner?: boolean;
  isSelf?: boolean;
  canKick?: boolean;
  canManageRoles?: boolean;
  roles?: ServerRole[];
  assignedRoleIds?: string[];
  onAssignRole?: (userId: string, roleId: string) => void | Promise<void>;
  onRemoveRole?: (userId: string, roleId: string) => void | Promise<void>;
  onMessage?: (userId: string) => void;
  onKick?: (userId: string) => void;
  onTimeout?: (userId: string, minutes: number) => void;
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
  isOwner,
  isSelf,
  canKick,
  canManageRoles,
  roles = [],
  assignedRoleIds = [],
  onAssignRole,
  onRemoveRole,
  onMessage,
  onKick,
  onTimeout,
}: UserProfilePopoutProps) {
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const assigned = new Set(assignedRoleIds);
  const allowRoles = Boolean((canManageRoles ?? isOwner) && !isSelf);
  const allowKick = Boolean((canKick ?? isOwner) && !isSelf);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setBusyRole(null);
  }, [open, profile?.id]);

  if (!open || !profile) return null;

  const status = profile.status ?? "online";
  const showRoles = roles.length > 0 || allowRoles;

  async function toggleRole(roleId: string) {
    if (!allowRoles || busyRole) return;
    setBusyRole(roleId);
    try {
      if (assigned.has(roleId)) {
        await onRemoveRole?.(profile!.id, roleId);
      } else {
        await onAssignRole?.(profile!.id, roleId);
      }
    } finally {
      setBusyRole(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <button
        type="button"
        className="hango-anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="hango-anim-pop relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-border-strong bg-bg-elevated shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="relative h-24 bg-gradient-to-br from-emerald-500/50 via-teal-700/30 to-bg">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-sm text-white/80 transition hover:bg-black/55 hover:text-white"
            aria-label="Close profile"
          >
            ×
          </button>
        </div>

        <div className="relative px-4 pb-4">
          <div className="-mt-11 mb-3 inline-block rounded-full bg-bg-elevated p-1">
            <div className="relative">
              <Avatar
                name={profile.display_name}
                src={profile.avatar_url}
                size="xl"
              />
              <span
                className={cn(
                  "absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full ring-[3px] ring-bg-elevated",
                  STATUS_DOT[status],
                )}
              />
            </div>
          </div>

          <div className="rounded-xl bg-bg px-3.5 py-3 ring-1 ring-border">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              {profile.display_name}
            </h2>
            {profile.username && (
              <p className="text-xs text-text-muted">@{profile.username}</p>
            )}
            <p className="mt-1.5 text-xs text-text-secondary">
              <span
                className={cn(
                  "mr-1.5 inline-block h-2 w-2 rounded-full align-middle",
                  STATUS_DOT[status],
                )}
              />
              {STATUS_LABEL[status]}
              {profile.custom_status ? ` · ${profile.custom_status}` : ""}
            </p>

            {profile.bio && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  About Me
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {profile.bio}
                </p>
              </div>
            )}

            {showRoles && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Roles
                  {allowRoles ? " · tap to toggle" : ""}
                </p>
                {roles.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    No roles yet. Create some from the server menu.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((role) => {
                      const on = assigned.has(role.id);
                      const busy = busyRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          disabled={!allowRoles || busy}
                          onClick={() => void toggleRole(role.id)}
                          title={
                            allowRoles
                              ? on
                                ? `Remove ${role.name}`
                                : `Give ${role.name}`
                              : role.name
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition duration-150",
                            on
                              ? "border-transparent bg-bg-hover text-text"
                              : "border-border text-text-muted",
                            allowRoles &&
                              "hover:scale-[1.03] hover:border-border-strong hover:text-text active:scale-[0.98]",
                            !allowRoles && "cursor-default",
                            busy && "opacity-60",
                          )}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: role.color || "#57F287" }}
                          />
                          {role.name}
                          {allowRoles && (
                            <span className="text-[10px] text-text-muted">
                              {on ? "✓" : "+"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isSelf && (
            <div className="mt-3 flex flex-col gap-1.5">
              {onMessage && (
                <ActionButton
                  label="Message"
                  onClick={() => {
                    onMessage(profile.id);
                    onClose();
                  }}
                />
              )}
              {allowKick && onTimeout && (
                <ActionButton
                  label="Timeout 10 minutes"
                  onClick={() => {
                    onTimeout(profile.id, 10);
                    onClose();
                  }}
                />
              )}
              {allowKick && onKick && (
                <ActionButton
                  label="Kick from server"
                  danger
                  onClick={() => {
                    onKick(profile.id);
                    onClose();
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left text-sm transition duration-150 hover:bg-bg-hover active:scale-[0.99]",
        danger ? "text-rose-400 hover:text-rose-300" : "text-text-secondary hover:text-text",
      )}
    >
      {label}
    </button>
  );
}
