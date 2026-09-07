"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ServerRole } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type RolesModalProps = {
  open: boolean;
  onClose: () => void;
  serverId: string;
  isOwner: boolean;
};

/** Bitmask flags stored on server_roles.permissions */
export const ROLE_PERMS = {
  MANAGE_CHANNELS: 1 << 0,
  KICK_MEMBERS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_MESSAGES: 1 << 3,
} as const;

const PERM_OPTIONS: { bit: number; label: string }[] = [
  { bit: ROLE_PERMS.MANAGE_CHANNELS, label: "Manage channels" },
  { bit: ROLE_PERMS.KICK_MEMBERS, label: "Kick members" },
  { bit: ROLE_PERMS.MANAGE_ROLES, label: "Manage roles" },
  { bit: ROLE_PERMS.MANAGE_MESSAGES, label: "Manage messages" },
];

export function RolesModal({
  open,
  onClose,
  serverId,
  isOwner,
}: RolesModalProps) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#57F287");
  const [perms, setPerms] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    void supabase
      .from("server_roles")
      .select("*")
      .eq("server_id", serverId)
      .order("position")
      .then(({ data, error }) => {
        if (error) {
          toast(
            /server_roles|relation/i.test(error.message)
              ? "Run migration 006 for roles"
              : error.message,
            "danger",
          );
          return;
        }
        setRoles((data as ServerRole[]) ?? []);
      });
  }, [open, serverId, toast]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function createRole(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("server_roles")
      .insert({
        server_id: serverId,
        name: name.trim(),
        color,
        position: roles.length,
        permissions: perms,
      })
      .select("*")
      .single();
    if (error) {
      toast(error.message, "danger");
      return;
    }
    setRoles((prev) => [...prev, data as ServerRole]);
    setName("");
    setPerms(0);
    toast("Role created", "success");
  }

  async function saveRolePerms(role: ServerRole, nextPerms: number) {
    if (!isOwner) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("server_roles")
      .update({ permissions: nextPerms })
      .eq("id", role.id);
    if (error) {
      toast(error.message, "danger");
      return;
    }
    setRoles((prev) =>
      prev.map((r) =>
        r.id === role.id ? { ...r, permissions: nextPerms } : r,
      ),
    );
  }

  function toggleCreatePerm(bit: number) {
    setPerms((p) => (p & bit ? p & ~bit : p | bit));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="hango-anim-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="hango-anim-pop relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Server Roles</h2>
          <p className="text-xs text-text-muted">
            Create roles, then click a member on the right to give them out
          </p>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto px-5 py-3">
          {roles.length === 0 && (
            <p className="text-xs text-text-muted">No roles yet</p>
          )}
          {roles.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border bg-bg px-3 py-2 transition hover:border-border-strong"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() =>
                  setEditingId((id) => (id === r.id ? null : r.id))
                }
                disabled={!isOwner}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: r.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.name}
                </span>
                <span className="text-[10px] text-text-muted">
                  {PERM_OPTIONS.filter((p) => r.permissions & p.bit).length ||
                    "no"}{" "}
                  perms
                </span>
              </button>
              {editingId === r.id && isOwner && (
                <div className="mt-2 grid grid-cols-2 gap-1 border-t border-border pt-2">
                  {PERM_OPTIONS.map((opt) => {
                    const on = Boolean(r.permissions & opt.bit);
                    return (
                      <label
                        key={opt.bit}
                        className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-text-secondary hover:bg-bg-hover"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const next = on
                              ? r.permissions & ~opt.bit
                              : r.permissions | opt.bit;
                            void saveRolePerms(r, next);
                          }}
                          className="accent-emerald-500"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <form
            onSubmit={(e) => void createRole(e)}
            className="space-y-2 border-t border-border px-5 py-4"
          >
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Role name"
                className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-2 py-1.5 text-sm outline-none focus:border-emerald-500/50"
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent"
              />
              <button
                type="submit"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90 active:scale-[0.98]"
              >
                Add
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PERM_OPTIONS.map((opt) => (
                <label
                  key={opt.bit}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-text-secondary hover:bg-bg-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(perms & opt.bit)}
                    onChange={() => toggleCreatePerm(opt.bit)}
                    className="accent-emerald-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </form>
        )}
        <div className="border-t border-border px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary transition hover:text-text"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
