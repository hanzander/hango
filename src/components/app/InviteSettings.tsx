"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Server } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type InviteSettingsProps = {
  open: boolean;
  onClose: () => void;
  server: Server;
  onUpdated: (patch: Partial<Server>) => void;
};

export function InviteSettings({
  open,
  onClose,
  server,
  onUpdated,
}: InviteSettingsProps) {
  const { toast } = useToast();
  const [expiresHours, setExpiresHours] = useState("");
  const [maxUses, setMaxUses] = useState("");

  useEffect(() => {
    if (!open) return;
    setExpiresHours("");
    setMaxUses(
      server.invite_max_uses != null ? String(server.invite_max_uses) : "",
    );
  }, [open, server.invite_max_uses]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const hours = Number(expiresHours);
    const uses = Number(maxUses);
    const patch: Record<string, unknown> = {
      invite_expires_at:
        expiresHours && !Number.isNaN(hours) && hours > 0
          ? new Date(Date.now() + hours * 3600_000).toISOString()
          : null,
      invite_max_uses:
        maxUses && !Number.isNaN(uses) && uses > 0 ? Math.floor(uses) : null,
    };
    const { error } = await supabase
      .from("servers")
      .update(patch)
      .eq("id", server.id);
    if (error) {
      toast(
        /invite_expires|column/i.test(error.message)
          ? "Run migration 007 for invite settings"
          : error.message,
        "danger",
      );
      return;
    }
    onUpdated(patch as Partial<Server>);
    toast("Invite settings saved", "success");
    onClose();
  }

  async function regenerate() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("generate_invite_code");
    // generate_invite_code returns text — update server
    if (error) {
      // fallback client-side-ish via update with random
      const code = Math.random().toString(36).slice(2, 10);
      const { error: err2 } = await supabase
        .from("servers")
        .update({ invite_code: code, invite_uses: 0 })
        .eq("id", server.id);
      if (err2) {
        toast(err2.message, "danger");
        return;
      }
      onUpdated({ invite_code: code, invite_uses: 0 });
      toast("Invite regenerated", "success");
      return;
    }
    const code = data as string;
    const { error: err2 } = await supabase
      .from("servers")
      .update({ invite_code: code, invite_uses: 0 })
      .eq("id", server.id);
    if (err2) {
      toast(err2.message, "danger");
      return;
    }
    onUpdated({ invite_code: code, invite_uses: 0 });
    toast("Invite regenerated", "success");
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void save(e)}
        className="relative w-full max-w-md rounded-2xl border border-border bg-bg-elevated shadow-2xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Invite settings</h2>
          <p className="mt-1 font-mono text-xs text-text-muted">
            {server.invite_code}
          </p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1 text-xs text-text-muted">
            Expires in (hours, blank = never)
            <input
              value={expiresHours}
              onChange={(e) => setExpiresHours(e.target.value)}
              type="number"
              min={1}
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text outline-none"
            />
          </label>
          <label className="block space-y-1 text-xs text-text-muted">
            Max uses (blank = unlimited)
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              type="number"
              min={1}
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text outline-none"
            />
          </label>
          <p className="text-[11px] text-text-muted">
            Uses so far: {server.invite_uses ?? 0}
          </p>
        </div>
        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => void regenerate()}
            className="text-xs text-text-muted hover:text-text"
          >
            Regenerate
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
