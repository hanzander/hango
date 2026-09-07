"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserStatus } from "@/lib/types";
import { useAppearance } from "@/components/ui/Appearance";
import { ensureNotificationPermission } from "@/lib/desktop-notify";

type ProfileEditorProps = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved: (next: Profile) => void;
};

const STATUSES: { id: UserStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Idle" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "invisible", label: "Invisible" },
];

/** Discord-like user settings: profile + status */
export function ProfileEditor({
  open,
  onClose,
  profile,
  onSaved,
}: ProfileEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.display_name);
  const [preview, setPreview] = useState<string | null>(profile.avatar_url);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UserStatus>(profile.status ?? "online");
  const [customStatus, setCustomStatus] = useState(profile.custom_status ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { theme, density, setTheme, setDensity } = useAppearance();

  useEffect(() => {
    if (!open) return;
    setName(profile.display_name);
    setPreview(profile.avatar_url);
    setFile(null);
    setStatus(profile.status ?? "online");
    setCustomStatus(profile.custom_status ?? "");
    setBio(profile.bio ?? "");
    setError(null);
  }, [open, profile]);

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
    setPreview(f ? URL.createObjectURL(f) : profile.avatar_url);
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

      let nextAvatar = profile.avatar_url;
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

      const trimmed = name.trim() || profile.display_name;
      const patch = {
        display_name: trimmed,
        avatar_url: nextAvatar,
        status,
        custom_status: customStatus.trim() || null,
        bio: bio.trim() || null,
      };
      const { error: updateError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id);
      if (updateError) throw updateError;

      onSaved({ ...profile, ...patch, id: user.id });
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
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-bg-elevated shadow-2xl">
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

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-5 py-5">
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

          <div className="space-y-1.5">
            <span className="text-xs text-text-muted">Status</span>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  className={
                    status === s.id
                      ? "rounded-lg bg-accent/20 px-2 py-2 text-xs font-medium text-accent"
                      : "rounded-lg border border-border px-2 py-2 text-xs text-text-secondary hover:text-text"
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-text-muted">Custom status</span>
            <input
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              maxLength={80}
              placeholder="What's up?"
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-text-muted">About Me</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={190}
              rows={3}
              className="w-full resize-none rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs text-text-muted">Appearance</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={
                  theme === "dark"
                    ? "flex-1 rounded-lg bg-accent/20 py-2 text-xs text-accent"
                    : "flex-1 rounded-lg border border-border py-2 text-xs text-text-secondary"
                }
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={
                  theme === "light"
                    ? "flex-1 rounded-lg bg-accent/20 py-2 text-xs text-accent"
                    : "flex-1 rounded-lg border border-border py-2 text-xs text-text-secondary"
                }
              >
                Light
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDensity("cozy")}
                className={
                  density === "cozy"
                    ? "flex-1 rounded-lg bg-accent/20 py-2 text-xs text-accent"
                    : "flex-1 rounded-lg border border-border py-2 text-xs text-text-secondary"
                }
              >
                Cozy
              </button>
              <button
                type="button"
                onClick={() => setDensity("compact")}
                className={
                  density === "compact"
                    ? "flex-1 rounded-lg bg-accent/20 py-2 text-xs text-accent"
                    : "flex-1 rounded-lg border border-border py-2 text-xs text-text-secondary"
                }
              >
                Compact
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void ensureNotificationPermission()}
            className="w-full rounded-lg border border-border-strong py-2 text-xs text-text-secondary hover:text-text"
          >
            Enable desktop notifications
          </button>

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
