"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DmMessage, Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime, isSupabaseConfigured } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export function DmWorkspace({
  channelId,
  userId,
  displayName,
}: {
  channelId: string;
  userId: string;
  displayName: string;
}) {
  const { toast } = useToast();
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data: members } = await supabase
        .from("dm_members")
        .select("user_id, profiles(*)")
        .eq("channel_id", channelId);
      const others = (members ?? [])
        .map((m) => {
          const p = m.profiles as Profile | Profile[] | null;
          return Array.isArray(p) ? p[0] : p;
        })
        .filter((p): p is Profile => p != null && p.id !== userId);
      if (!cancelled) setOther(others[0] ?? null);

      const { data } = await supabase
        .from("dm_messages")
        .select("*, author:profiles!author_id(*)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled) {
        setMessages(((data as DmMessage[]) ?? []).filter((m) => !m.deleted_at));
        setLoading(false);
      }
    }

    void load();

    const channel = supabase
      .channel(`dm:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const row = payload.new as DmMessage;
          const { data: author } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", row.author_id)
            .single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, author: (author as Profile) ?? null }];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelId, userId]);

  const send = useCallback(async () => {
    const content = value.trim();
    if (!content) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("dm_messages")
      .insert({ channel_id: channelId, author_id: userId, content })
      .select("*, author:profiles!author_id(*)")
      .single();
    if (error) {
      toast(error.message, "danger");
      return;
    }
    const row = data as DmMessage;
    setMessages((prev) =>
      prev.some((m) => m.id === row.id) ? prev : [...prev, row],
    );
    setValue("");
  }, [value, channelId, userId, toast]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <Link href="/app/friends" className="text-xs text-text-muted hover:text-text">
          ← Friends
        </Link>
        {other && (
          <>
            <Avatar name={other.display_name} src={other.avatar_url} size="sm" />
            <span className="text-sm font-medium">{other.display_name}</span>
          </>
        )}
        {!other && (
          <span className="text-sm text-text-muted">Direct Message</span>
        )}
      </header>
      <div className="hango-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading && (
          <p className="text-sm text-text-muted">Loading…</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-text-muted">
            Say hi to {other?.display_name ?? "them"}.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2">
            <Avatar
              name={m.author?.display_name || "?"}
              src={m.author?.avatar_url}
              size="sm"
            />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {m.author_id === userId
                    ? displayName
                    : m.author?.display_name || "User"}
                </span>
                <time className="text-[10px] text-text-muted">
                  {formatMessageTime(m.created_at)}
                </time>
              </div>
              <p className="text-sm text-text-secondary">{m.content}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Message @${other?.display_name ?? "friend"}`}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
        >
          Send
        </button>
      </form>
    </div>
  );
}
