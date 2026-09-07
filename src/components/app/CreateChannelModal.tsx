"use client";

import { FormEvent, useEffect, useState } from "react";

type CreateChannelModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, kind: "text" | "voice") => Promise<void> | void;
};

export function CreateChannelModal({
  open,
  onClose,
  onCreate,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("text");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(trimmed, kind);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create channel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="hango-anim-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="hango-anim-pop relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text">Create Channel</h2>
          <p className="text-xs text-text-muted">Text or voice, Discord-style</p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="flex gap-2">
            {(
              [
                ["text", "Text"],
                ["voice", "Voice"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  kind === k
                    ? "flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
                    : "flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:text-text"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-text-muted">Channel name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "voice" ? "lounge" : "general"}
              maxLength={40}
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
              autoFocus
              required
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
