"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";

type ProfileEditorProps = {
  open: boolean;
  onClose: () => void;
  displayName: string;
  avatarUrl?: string | null;
  onSaved: (next: { displayName: string; avatarUrl: string | null }) => void;
};

/** Discord-like user settings: edit display name + avatar */
export function ProfileEditor({
  open,
  onClose,
  displayName,
  avatarUrl,
  onSaved,
}: ProfileEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName);
  const [preview, setPreview] = useState<string | null>(avatarUrl ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(displayName);
    setPreview(avatarUrl ?? null);
    setFile(null);
    setError(null);
  }, [open, displayName, avatarUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function onPickFile(f: File | null) {
    setFile(f);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : (avatarUrl ?? null));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let nextAvatar = avatarUrl ?? null;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        nextAvatar = `${data.publicUrl}?t=${Date.now()}`;
      }

      const trimmed = name.trim() || displayName;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          avatar_url: nextAvatar,
        })
        .eq("id", user.id);
      if (updateError) throw updateError;

      onSaved({ displayName: trimmed, avatarUrl: nextAvatar });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setLoading(false);
    }
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
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text">User Settings</h2>
            <p className="text-xs text-text-muted">My Profile</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-bg-hover hover:text-text"
          >
            Esc
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative shrink-0"
            >
              <Avatar name={name || "?"} src={preview} size="xl" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                Change
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-text-muted">Avatar</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:text-text"
              >
                Upload image
              </button>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-text-muted">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
              required
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
