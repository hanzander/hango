"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";

export function OnboardingForm({
  initialDisplayName = "",
}: {
  initialDisplayName?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onPickFile(f: File | null) {
    setFile(f);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
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

      let avatarUrl: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
      }

      const { error: rpcError } = await supabase.rpc("complete_onboarding", {
        p_username: username,
        p_display_name: displayName,
        p_avatar_url: avatarUrl,
      });
      if (rpcError) throw rpcError;

      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative"
        >
          <Avatar
            name={displayName || username || "?"}
            src={preview}
            size="xl"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Upload
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-text-muted">Optional profile picture</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Username</span>
        <input
          type="text"
          required
          value={username}
          onChange={(e) =>
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
          }
          pattern="[a-z0-9_]{3,20}"
          minLength={3}
          maxLength={20}
          className="w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted"
          placeholder="han_zander"
          autoComplete="username"
        />
        <span className="text-[11px] text-text-muted">
          3–20 characters · a–z, 0–9, _
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs text-text-secondary">Display name</span>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={32}
          className="w-full rounded-lg border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-text-muted"
          placeholder="Han"
          autoComplete="nickname"
        />
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Continue to Hango"}
      </button>
    </form>
  );
}
