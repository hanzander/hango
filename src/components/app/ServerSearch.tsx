"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { formatMessageTime } from "@/lib/utils";

type ServerSearchProps = {
  open: boolean;
  onClose: () => void;
  serverId: string;
  onJump: (channelId: string, messageId: string) => void;
};

export function ServerSearch({
  open,
  onClose,
  serverId,
  onJump,
}: ServerSearchProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    (Message & { channel_name?: string })[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      const supabase = createClient();
      const { data: channels } = await supabase
        .from("channels")
        .select("id, name")
        .eq("server_id", serverId);
      const channelIds = (channels ?? []).map((c) => c.id as string);
      const nameById = new Map(
        (channels ?? []).map((c) => [c.id as string, c.name as string]),
      );
      if (!channelIds.length) {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("messages")
        .select("*, author:profiles!author_id(*)")
        .in("channel_id", channelIds)
        .ilike("content", `%${q.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      setResults(
        ((data as Message[]) ?? []).map((m) => ({
          ...m,
          channel_name: nameById.get(m.channel_id),
        })),
      );
      setLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, serverId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/60 p-4 pt-[12vh] hango-anim-fade">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="hango-anim-pop relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages in this server…"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
        </div>
        <div className="hango-scroll max-h-80 overflow-y-auto p-2">
          {loading && (
            <p className="px-2 py-4 text-center text-xs text-text-muted">
              Searching…
            </p>
          )}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-text-muted">
              No results
            </p>
          )}
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-bg-hover"
              onClick={() => {
                onJump(m.channel_id, m.id);
                onClose();
              }}
            >
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <span>#{m.channel_name ?? "channel"}</span>
                <span>·</span>
                <span>{m.author?.display_name ?? "User"}</span>
                <span>·</span>
                <span>{formatMessageTime(m.created_at)}</span>
              </div>
              <p className="line-clamp-2 text-sm text-text-secondary">
                {m.content}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
