"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DmMessage, Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime, isSupabaseConfigured } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Lightbox } from "./Lightbox";
import { notifyDesktop, ensureNotificationPermission } from "@/lib/desktop-notify";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
    void ensureNotificationPermission();

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
          if (row.author_id !== userId) {
            notifyDesktop(
              other?.display_name || "Direct Message",
              row.content.slice(0, 120),
              { tag: `dm-${channelId}` },
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelId, userId, other?.display_name]);

  const send = useCallback(
    async (content: string, imageUrl?: string) => {
      const text = content.trim() || (imageUrl ? "📷" : "");
      if (!text) return;
      setSending(true);
      const supabase = createClient();
      const body = imageUrl ? `${text}\n${imageUrl}` : text;
      const { data, error } = await supabase
        .from("dm_messages")
        .insert({ channel_id: channelId, author_id: userId, content: body })
        .select("*, author:profiles!author_id(*)")
        .single();
      setSending(false);
      if (error) {
        toast(error.message, "danger");
        return;
      }
      const row = data as DmMessage;
      setMessages((prev) =>
        prev.some((m) => m.id === row.id) ? prev : [...prev, row],
      );
      setValue("");
    },
    [channelId, userId, toast],
  );

  async function uploadImage(file: File) {
    const supabase = createClient();
    const path = `${userId}/dm/${channelId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type });
    if (error) {
      toast(error.message, "danger");
      return;
    }
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    await send(value, data.publicUrl);
  }

  function renderContent(content: string) {
    const urls = content.match(/https?:\/\/\S+/g) ?? [];
    const imageUrl = urls.find((u) =>
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u),
    );
    const text = content.replace(imageUrl ?? "", "").trim();
    return (
      <>
        {text && <p className="text-sm text-text-secondary">{text}</p>}
        {imageUrl && (
          <button
            type="button"
            onClick={() => setLightbox(imageUrl)}
            className="mt-1 block overflow-hidden rounded-lg border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="max-h-64 max-w-xs object-contain" />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <Link href="/app/friends" className="text-xs text-text-muted hover:text-text">
          ← Friends
        </Link>
        {other && (
          <>
            <Avatar name={other.display_name} src={other.avatar_url} size="sm" />
            <div className="min-w-0">
              <span className="text-sm font-medium">{other.display_name}</span>
              <p className="text-[10px] text-text-muted">
                {other.status === "idle"
                  ? "Idle"
                  : other.status === "dnd"
                    ? "Do Not Disturb"
                    : "Online"}
              </p>
            </div>
          </>
        )}
        {!other && (
          <span className="text-sm text-text-muted">Direct Message</span>
        )}
      </header>
      <div className="hango-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading && <p className="text-sm text-text-muted">Loading…</p>}
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
              {renderContent(m.content)}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(value);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadImage(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-border-strong px-2 py-2 text-xs text-text-secondary"
        >
          Photo
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Message @${other?.display_name ?? "friend"}`}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={sending || !value.trim()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
