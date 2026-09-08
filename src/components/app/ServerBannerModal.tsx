"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Server } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type ServerBannerModalProps = {
  open: boolean;
  onClose: () => void;
  server: Server;
  onUpdated: (patch: Partial<Server>) => void;
};

const MAX_BYTES = 8 * 1024 * 1024;

export function ServerBannerModal({
  open,
  onClose,
  server,
  onUpdated,
}: ServerBannerModalProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setBusy(false);
      return;
    }
    setPreview(server.banner_url ?? null);
  }, [open, server.banner_url]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  function onPick(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Choose an image file", "danger");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast("Image must be under 8MB", "danger");
      return;
    }
    setFile(f);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toast("Pick an image first", "danger");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const path = `${server.id}/banner-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("server-media")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      setBusy(false);
      toast(
        /bucket|not found|row-level/i.test(upErr.message)
          ? "Run migration 010 for server banners (or check storage policies)"
          : upErr.message,
        "danger",
      );
      return;
    }

    const { data: pub } = supabase.storage
      .from("server-media")
      .getPublicUrl(path);
    const banner_url = `${pub.publicUrl}?t=${Date.now()}`;

    const { error } = await supabase
      .from("servers")
      .update({ banner_url })
      .eq("id", server.id);

    setBusy(false);
    if (error) {
      toast(
        /banner_url|column/i.test(error.message)
          ? "Run migration 010 to add banner_url on servers"
          : error.message,
        "danger",
      );
      return;
    }

    onUpdated({ banner_url });
    toast("Server cover updated", "success");
    onClose();
  }

  async function removeBanner() {
    if (!server.banner_url) {
      onClose();
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("servers")
      .update({ banner_url: null })
      .eq("id", server.id);
    setBusy(false);
    if (error) {
      toast(error.message, "danger");
      return;
    }
    onUpdated({ banner_url: null });
    toast("Cover removed", "success");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="hango-anim-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void save(e)}
        className="hango-anim-pop relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Server cover</h2>
          <p className="mt-1 text-xs text-text-muted">
            Shown on the server picker — like Discord’s banner.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="overflow-hidden rounded-xl border border-border-strong bg-bg">
            <div
              className="relative h-28 w-full bg-[#1a1816]"
              style={
                preview
                  ? {
                      backgroundImage: `url(${preview})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              {!preview && (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
                  No cover yet
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-active text-xs font-medium text-text ring-1 ring-border">
                {(server.name || "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">
                  {server.name}
                </p>
                <p className="text-[11px] text-text-muted">Preview</p>
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary transition hover:bg-bg-hover hover:text-text"
          >
            {file ? "Choose a different image" : "Upload image"}
          </button>
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            disabled={busy || !server.banner_url}
            onClick={() => void removeBanner()}
            className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40"
          >
            Remove
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
              disabled={busy || !file}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
