"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

export type ServerEmoji = {
  id: string;
  server_id: string;
  name: string;
  url: string;
};

type EmojiManagerProps = {
  open: boolean;
  onClose: () => void;
  serverId: string;
  isOwner: boolean;
  onPick?: (emoji: ServerEmoji) => void;
};

export function EmojiManager({
  open,
  onClose,
  serverId,
  isOwner,
  onPick,
}: EmojiManagerProps) {
  const { toast } = useToast();
  const [emoji, setEmoji] = useState<ServerEmoji[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    void supabase
      .from("server_emoji")
      .select("*")
      .eq("server_id", serverId)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast(
            /server_emoji|relation/i.test(error.message)
              ? "Run migration 007 for custom emoji"
              : error.message,
            "danger",
          );
          return;
        }
        setEmoji((data as ServerEmoji[]) ?? []);
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

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!isOwner || !file || !name.trim()) return;
    const clean = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32);
    if (clean.length < 2) {
      toast("Emoji name too short", "danger");
      return;
    }
    const supabase = createClient();
    const path = `${serverId}/${clean}-${Date.now()}.${file.name.split(".").pop() || "png"}`;
    const { error: upErr } = await supabase.storage
      .from("server-emoji")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast(upErr.message, "danger");
      return;
    }
    const { data: pub } = supabase.storage
      .from("server-emoji")
      .getPublicUrl(path);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("server_emoji")
      .insert({
        server_id: serverId,
        name: clean,
        url: pub.publicUrl,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();
    if (error) {
      toast(error.message, "danger");
      return;
    }
    setEmoji((prev) => [...prev, data as ServerEmoji]);
    setName("");
    setFile(null);
    toast(`:${clean}: added`, "success");
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Server Emoji</h2>
          <p className="text-xs text-text-muted">Click to insert · :name:</p>
        </div>
        <div className="hango-scroll grid max-h-56 grid-cols-6 gap-2 overflow-y-auto p-4">
          {emoji.length === 0 && (
            <p className="col-span-6 text-xs text-text-muted">No custom emoji</p>
          )}
          {emoji.map((em) => (
            <button
              key={em.id}
              type="button"
              title={`:${em.name}:`}
              onClick={() => {
                onPick?.(em);
                onClose();
              }}
              className="flex flex-col items-center gap-1 rounded-md p-1 hover:bg-bg-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={em.url} alt={em.name} className="h-8 w-8 object-contain" />
              <span className="truncate text-[9px] text-text-muted">{em.name}</span>
            </button>
          ))}
        </div>
        {isOwner && (
          <form
            onSubmit={(e) => void upload(e)}
            className="space-y-2 border-t border-border px-5 py-4"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="emoji_name"
              className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm outline-none"
            />
            <input
              type="file"
              accept="image/png,image/gif,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-text-muted"
            />
            <button
              type="submit"
              disabled={!file || !name.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
            >
              Upload emoji
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
