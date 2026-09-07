"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ServerRole } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type RolesModalProps = {
  open: boolean;
  onClose: () => void;
  serverId: string;
  isOwner: boolean;
};

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
      })
      .select("*")
      .single();
    if (error) {
      toast(error.message, "danger");
      return;
    }
    setRoles((prev) => [...prev, data as ServerRole]);
    setName("");
    toast("Role created", "success");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Server Roles</h2>
          <p className="text-xs text-text-muted">Basic Discord-style roles</p>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto px-5 py-3">
          {roles.length === 0 && (
            <p className="text-xs text-text-muted">No roles yet</p>
          )}
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: r.color }}
              />
              <span className="text-sm">{r.name}</span>
            </div>
          ))}
        </div>
        {isOwner && (
          <form
            onSubmit={(e) => void createRole(e)}
            className="flex gap-2 border-t border-border px-5 py-4"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Role name"
              className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-2 py-1.5 text-sm outline-none"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
            >
              Add
            </button>
          </form>
        )}
        <div className="border-t border-border px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
