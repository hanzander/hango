"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ServerActionsModalProps = {
  open: boolean;
  onClose: () => void;
  onJoined: (serverId: string) => void;
};

export function ServerActionsModal({
  open,
  onClose,
  onJoined,
}: ServerActionsModalProps) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("create_server", {
        p_name: name,
      });
      if (rpcError) throw rpcError;
      onJoined(data as string);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create server");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "join_server_by_invite",
        { p_code: code },
      );
      if (rpcError) throw rpcError;
      onJoined(data as string);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border-strong bg-bg-elevated p-5 shadow-2xl">
        <h2 className="text-lg font-semibold tracking-tight text-text">
          Add a server
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Create your own space or join one with an invite code.
        </p>

        <div className="mt-4 flex gap-1 rounded-lg border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => {
              setTab("create");
              setError(null);
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === "create"
                ? "bg-bg-active text-text"
                : "text-text-secondary hover:text-text",
            )}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("join");
              setError(null);
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === "join"
                ? "bg-bg-active text-text"
                : "text-text-secondary hover:text-text",
            )}
          >
            Join
          </button>
        </div>

        {tab === "create" ? (
          <form onSubmit={handleCreate} className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-text-secondary">Server name</span>
              <input
                required
                minLength={2}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
                placeholder="My hangout"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create server"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-text-secondary">Invite code</span>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-text-muted"
                placeholder="abcdefgh"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {loading ? "Joining…" : "Join server"}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
