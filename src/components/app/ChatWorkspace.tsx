"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { EmptyServersHome } from "@/components/app/EmptyServersHome";
import {
  getMockChannels,
  getMockMessages,
  MOCK_CHANNELS,
  MOCK_PROFILE,
  MOCK_SERVERS,
} from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import type {
  Channel,
  Message,
  MessageReaction,
  Profile,
  Server,
} from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/utils";
import { playMessageNotification } from "@/lib/call-sounds";
import { useToast } from "@/components/ui/Toast";

type ChatWorkspaceProps = {
  serverId?: string;
  channelId?: string;
  demo?: boolean;
};

function enrichMessages(
  rows: Message[],
  replyMap: Map<string, Message>,
  reactionsByMsg: Map<string, MessageReaction[]>,
): Message[] {
  return rows.map((m) => ({
    ...m,
    reply_to: m.reply_to_id ? replyMap.get(m.reply_to_id) ?? null : null,
    reactions: reactionsByMsg.get(m.id) ?? [],
  }));
}

export function ChatWorkspace({
  serverId,
  channelId,
  demo = false,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const configured = isSupabaseConfigured() && !demo;

  const demoChannelFromQuery = searchParams.get("c") ?? undefined;

  const [servers, setServers] = useState<Server[]>(
    configured ? [] : MOCK_SERVERS,
  );
  const [channels, setChannels] = useState<Channel[]>(
    configured ? [] : MOCK_CHANNELS,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<Profile | null>(
    configured ? null : MOCK_PROFILE,
  );
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(!configured);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [mutedServers, setMutedServers] = useState<Set<string>>(new Set());
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChannelIdRef = useRef<string | undefined>(undefined);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  useEffect(() => {
    try {
      setCompact(localStorage.getItem("hango-compact") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const activeServer = useMemo(() => {
    if (!servers.length) return null;
    return servers.find((s) => s.id === serverId) ?? servers[0];
  }, [servers, serverId]);

  const serverChannels = useMemo(() => {
    if (!activeServer) return [];
    const list = configured
      ? channels.filter((c) => c.server_id === activeServer.id)
      : getMockChannels(activeServer.id);
    return list.sort((a, b) => a.position - b.position);
  }, [channels, activeServer, configured]);

  const resolvedChannelId = demo
    ? demoChannelFromQuery ?? channelId
    : channelId;

  const activeChannel = useMemo(() => {
    if (!serverChannels.length) return null;
    const match = serverChannels.find((c) => c.id === resolvedChannelId);
    if (match) return match;
    return (
      serverChannels.find((c) => (c.kind ?? "text") === "text") ??
      serverChannels[0]
    );
  }, [serverChannels, resolvedChannelId]);

  activeChannelIdRef.current = activeChannel?.id;

  useEffect(() => {
    setReplyTo(null);
    setTypingNames([]);
    if (activeChannel?.id) {
      setUnreadChannels((prev) => {
        if (!prev.has(activeChannel.id)) return prev;
        const next = new Set(prev);
        next.delete(activeChannel.id);
        return next;
      });
    }
  }, [activeChannel?.id]);

  // Keep URL in sync
  useEffect(() => {
    if (demo || !activeServer || !serverChannels.length) return;

    if (!channelId) {
      const fallback =
        serverChannels.find((c) => (c.kind ?? "text") === "text") ??
        serverChannels[0];
      if (fallback) {
        router.replace(`/app/${activeServer.id}/${fallback.id}`);
      }
      return;
    }

    const exists = serverChannels.some((c) => c.id === channelId);
    if (!exists) {
      const fallback =
        serverChannels.find((c) => (c.kind ?? "text") === "text") ??
        serverChannels[0];
      if (fallback) {
        router.replace(`/app/${activeServer.id}/${fallback.id}`);
      }
    }
  }, [demo, activeServer, serverChannels, channelId, router]);

  const [demoMessages, setDemoMessages] = useState<Record<string, Message[]>>(
    () => {
      const map: Record<string, Message[]> = {};
      for (const ch of MOCK_CHANNELS) {
        map[ch.id] = getMockMessages(ch.id);
      }
      return map;
    },
  );

  useEffect(() => {
    if (configured) return;
    if (!activeChannel || (activeChannel.kind ?? "text") === "voice") {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setMessages(demoMessages[activeChannel.id] ?? []);
    setLoadingMessages(false);
  }, [configured, activeChannel, demoMessages]);

  // Bootstrap
  useEffect(() => {
    if (!configured) return;

    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData && !profileData.onboarding_complete) {
        router.replace("/onboarding");
        return;
      }

      const { data: memberRows } = await supabase
        .from("server_members")
        .select("server_id");

      const serverIds = (memberRows ?? []).map((m) => m.server_id);
      let serverRows: Server[] = [];

      if (serverIds.length) {
        const { data } = await supabase
          .from("servers")
          .select("*")
          .in("id", serverIds);
        serverRows = (data as Server[]) ?? [];
      }

      let channelRows: Channel[] = [];
      if (serverRows.length) {
        const { data } = await supabase
          .from("channels")
          .select("*")
          .in(
            "server_id",
            serverRows.map((s) => s.id),
          )
          .order("position");
        channelRows = (data as Channel[]) ?? [];
      }

      const { data: channelMuteRows } = await supabase
        .from("channel_mutes")
        .select("channel_id");
      const { data: serverMuteRows } = await supabase
        .from("server_mutes")
        .select("server_id");

      if (cancelled) return;

      setProfile(
        (profileData as Profile) ?? {
          id: user.id,
          display_name: user.email?.split("@")[0] ?? "User",
          avatar_url: null,
        },
      );
      setServers(serverRows);
      setChannels(channelRows);
      setMutedChannels(
        new Set((channelMuteRows ?? []).map((r) => r.channel_id as string)),
      );
      setMutedServers(
        new Set((serverMuteRows ?? []).map((r) => r.server_id as string)),
      );
      setBootstrapped(true);
    }

    load().catch((err) => {
      console.error(err);
      setBootstrapped(true);
    });

    return () => {
      cancelled = true;
    };
  }, [configured, router]);

  // Load messages + realtime
  useEffect(() => {
    if (!configured || !activeChannel) return;
    if ((activeChannel.kind ?? "text") === "voice") {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    async function loadMessages() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("channel_id", activeChannel!.id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (error) {
        console.error(error);
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      const rows = ((data as Message[]) ?? []).filter((m) => !m.deleted_at);
      const replyIds = [
        ...new Set(
          rows
            .map((m) => m.reply_to_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const replyMap = new Map<string, Message>();
      if (replyIds.length) {
        const { data: replies } = await supabase
          .from("messages")
          .select("*, author:profiles(*)")
          .in("id", replyIds);
        for (const r of (replies as Message[]) ?? []) {
          replyMap.set(r.id, r);
        }
      }

      const msgIds = rows.map((m) => m.id);
      const reactionsByMsg = new Map<string, MessageReaction[]>();
      if (msgIds.length) {
        const { data: reactions, error: reactErr } = await supabase
          .from("message_reactions")
          .select("*")
          .in("message_id", msgIds);
        if (!reactErr) {
          for (const r of (reactions as MessageReaction[]) ?? []) {
            const list = reactionsByMsg.get(r.message_id) ?? [];
            list.push(r);
            reactionsByMsg.set(r.message_id, list);
          }
        }
      }

      if (cancelled) return;
      setMessages(enrichMessages(rows, replyMap, reactionsByMsg));
      setLoadingMessages(false);
    }

    void loadMessages();

    const channel = supabase
      .channel(`messages:${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          const { data: author } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", row.author_id)
            .single();

          let reply_to: Message | null = null;
          if (row.reply_to_id) {
            const { data: parent } = await supabase
              .from("messages")
              .select("*, author:profiles(*)")
              .eq("id", row.reply_to_id)
              .maybeSingle();
            reply_to = (parent as Message) ?? null;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                ...row,
                author: (author as Profile) ?? null,
                reply_to,
                reactions: [],
              },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) =>
            prev
              .map((m) =>
                m.id === row.id
                  ? {
                      ...m,
                      ...row,
                      author: m.author,
                      reply_to: m.reply_to,
                      reactions: m.reactions,
                    }
                  : m,
              )
              .filter((m) => !m.deleted_at),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async () => {
          const ids = messages.map((m) => m.id);
          // refresh reactions for visible messages via re-fetch of current list
          const { data } = await supabase
            .from("messages")
            .select("id")
            .eq("channel_id", activeChannel!.id)
            .is("deleted_at", null)
            .limit(200);
          const msgIds = ((data as { id: string }[]) ?? []).map((r) => r.id);
          if (!msgIds.length) return;
          const { data: reactions } = await supabase
            .from("message_reactions")
            .select("*")
            .in("message_id", msgIds);
          const byMsg = new Map<string, MessageReaction[]>();
          for (const r of (reactions as MessageReaction[]) ?? []) {
            const list = byMsg.get(r.message_id) ?? [];
            list.push(r);
            byMsg.set(r.message_id, list);
          }
          setMessages((prev) =>
            prev.map((m) => ({ ...m, reactions: byMsg.get(m.id) ?? [] })),
          );
          void ids;
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId?: string; name?: string };
        if (!p?.userId || p.userId === profile?.id) return;
        const name = p.name || "Someone";
        setTypingNames((prev) =>
          prev.includes(name) ? prev : [...prev.slice(-2), name],
        );
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setTypingNames([]), 3000);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      cancelled = true;
      typingChannelRef.current = null;
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on channel change; reaction handler refreshes from DB
  }, [configured, activeChannel?.id, profile?.id]);

  // Server-wide chat notifications
  useEffect(() => {
    if (!configured || !activeServer || !profile?.id) return;

    const textChannelIds = new Set(
      channels
        .filter(
          (c) =>
            c.server_id === activeServer.id && (c.kind ?? "text") === "text",
        )
        .map((c) => c.id),
    );
    if (textChannelIds.size === 0) return;

    const supabase = createClient();
    const myId = profile.id;
    const myName = profile.display_name;
    const serverMuted = mutedServers.has(activeServer.id);

    const channel = supabase
      .channel(`server-chat-notify:${activeServer.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const row = payload.new as Message;
          if (!row?.channel_id || !row.author_id) return;
          if (row.author_id === myId) return;
          if (!textChannelIds.has(row.channel_id)) return;

          if (row.channel_id !== activeChannelIdRef.current) {
            setUnreadChannels((prev) => new Set(prev).add(row.channel_id));
          }

          if (serverMuted || mutedChannels.has(row.channel_id)) return;

          const mentioned =
            row.content.includes(`@${myName}`) ||
            row.content.includes("@everyone") ||
            row.content.includes("@here");

          // Always ping for mentions; otherwise normal channel ping
          if (mentioned || row.channel_id === activeChannelIdRef.current) {
            playMessageNotification();
          } else {
            playMessageNotification();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    configured,
    activeServer,
    channels,
    profile?.id,
    profile?.display_name,
    mutedChannels,
    mutedServers,
  ]);

  const handleSend = useCallback(
    async (content: string, replyToId?: string | null) => {
      if (!activeChannel) return;

      if (!configured) {
        const msg: Message = {
          id: `local-${Date.now()}`,
          channel_id: activeChannel.id,
          author_id: MOCK_PROFILE.id,
          content,
          created_at: new Date().toISOString(),
          reply_to_id: replyToId ?? null,
          author: MOCK_PROFILE,
          reply_to: replyToId
            ? (demoMessages[activeChannel.id] ?? []).find(
                (m) => m.id === replyToId,
              ) ?? null
            : null,
          reactions: [],
        };
        setDemoMessages((prev) => ({
          ...prev,
          [activeChannel.id]: [...(prev[activeChannel.id] ?? []), msg],
        }));
        setReplyTo(null);
        return;
      }

      if (!profile) return;
      const supabase = createClient();
      const { error } = await supabase.from("messages").insert({
        channel_id: activeChannel.id,
        author_id: profile.id,
        content,
        reply_to_id: replyToId ?? null,
      });
      if (error) {
        toast(error.message, "danger");
        throw error;
      }
      setReplyTo(null);
    },
    [activeChannel, configured, profile, demoMessages, toast],
  );

  const handleEdit = useCallback(
    async (messageId: string, content: string) => {
      if (!configured) {
        if (!activeChannel) return;
        setDemoMessages((prev) => ({
          ...prev,
          [activeChannel.id]: (prev[activeChannel.id] ?? []).map((m) =>
            m.id === messageId
              ? { ...m, content, edited_at: new Date().toISOString() }
              : m,
          ),
        }));
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) toast(error.message, "danger");
    },
    [configured, activeChannel, toast],
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      if (!configured) {
        if (!activeChannel) return;
        setDemoMessages((prev) => ({
          ...prev,
          [activeChannel.id]: (prev[activeChannel.id] ?? []).filter(
            (m) => m.id !== messageId,
          ),
        }));
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), content: "" })
        .eq("id", messageId);
      if (error) toast(error.message, "danger");
    },
    [configured, activeChannel, toast],
  );

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!profile) return;
      if (!configured) {
        if (!activeChannel) return;
        setDemoMessages((prev) => ({
          ...prev,
          [activeChannel.id]: (prev[activeChannel.id] ?? []).map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions ?? [];
            const mine = existing.find(
              (r) => r.user_id === profile.id && r.emoji === emoji,
            );
            return {
              ...m,
              reactions: mine
                ? existing.filter((r) => r !== mine)
                : [
                    ...existing,
                    {
                      message_id: messageId,
                      user_id: profile.id,
                      emoji,
                    },
                  ],
            };
          }),
        }));
        return;
      }

      const supabase = createClient();
      const existing = messages
        .find((m) => m.id === messageId)
        ?.reactions?.find(
          (r) => r.user_id === profile.id && r.emoji === emoji,
        );

      if (existing) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", profile.id)
          .eq("emoji", emoji);
        if (error) toast(error.message, "danger");
      } else {
        const { error } = await supabase.from("message_reactions").insert({
          message_id: messageId,
          user_id: profile.id,
          emoji,
        });
        if (error) toast(error.message, "danger");
      }
    },
    [configured, profile, activeChannel, messages, toast],
  );

  const handleTyping = useCallback(async () => {
    if (!configured || !profile) return;
    const ch = typingChannelRef.current;
    if (!ch) return;
    await ch.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: profile.id, name: profile.display_name },
    });
  }, [configured, profile]);

  const handleCreateChannel = useCallback(
    async (name: string, kind: "text" | "voice") => {
      if (!activeServer || !configured) return;
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_channel", {
        p_server_id: activeServer.id,
        p_name: name,
        p_kind: kind,
      });
      if (error) throw error;
      const created = (Array.isArray(data) ? data[0] : data) as Channel;
      if (!created?.id) throw new Error("Channel create returned empty");
      setChannels((prev) => [...prev, created]);
      toast(`#${created.name} created`, "success");
      router.push(`/app/${activeServer.id}/${created.id}`);
    },
    [activeServer, configured, router, toast],
  );

  const handleMuteChannel = useCallback(
    async (channelIdToMute: string, mute: boolean) => {
      if (!profile || !configured) return;
      const supabase = createClient();
      if (mute) {
        await supabase.from("channel_mutes").upsert({
          user_id: profile.id,
          channel_id: channelIdToMute,
        });
        setMutedChannels((prev) => new Set(prev).add(channelIdToMute));
        toast("Channel muted");
      } else {
        await supabase
          .from("channel_mutes")
          .delete()
          .eq("user_id", profile.id)
          .eq("channel_id", channelIdToMute);
        setMutedChannels((prev) => {
          const next = new Set(prev);
          next.delete(channelIdToMute);
          return next;
        });
        toast("Channel unmuted");
      }
    },
    [profile, configured, toast],
  );

  const handleMuteServer = useCallback(
    async (mute: boolean) => {
      if (!profile || !configured || !activeServer) return;
      const supabase = createClient();
      if (mute) {
        await supabase.from("server_mutes").upsert({
          user_id: profile.id,
          server_id: activeServer.id,
        });
        setMutedServers((prev) => new Set(prev).add(activeServer.id));
        toast("Server muted");
      } else {
        await supabase
          .from("server_mutes")
          .delete()
          .eq("user_id", profile.id)
          .eq("server_id", activeServer.id);
        setMutedServers((prev) => {
          const next = new Set(prev);
          next.delete(activeServer.id);
          return next;
        });
        toast("Server unmuted");
      }
    },
    [profile, configured, activeServer, toast],
  );

  const handleSignOut = useCallback(async () => {
    if (!configured) {
      router.push("/");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }, [configured, router]);

  const handleProfileSaved = useCallback((next: Profile) => {
    setProfile((prev) => (prev ? { ...prev, ...next } : next));
  }, []);

  const handleToggleCompact = useCallback(() => {
    setCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hango-compact", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (!bootstrapped) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg text-sm text-text-muted">
        Loading Hango…
      </div>
    );
  }

  if (!activeServer || !activeChannel) {
    return (
      <EmptyServersHome displayName={profile?.display_name ?? ""} />
    );
  }

  return (
    <AppShell
      server={activeServer}
      channels={serverChannels}
      channel={activeChannel}
      messages={messages}
      userId={profile?.id ?? ""}
      profile={profile}
      displayName={profile?.display_name ?? "User"}
      avatarUrl={profile?.avatar_url}
      loadingMessages={loadingMessages}
      demo={demo}
      replyTo={replyTo}
      typingNames={typingNames}
      mutedChannels={mutedChannels}
      serverMuted={mutedServers.has(activeServer.id)}
      unreadChannels={unreadChannels}
      compact={compact}
      onSend={handleSend}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onReact={handleReact}
      onReply={setReplyTo}
      onCancelReply={() => setReplyTo(null)}
      onTyping={handleTyping}
      onCreateChannel={handleCreateChannel}
      onMuteChannel={handleMuteChannel}
      onMuteServer={handleMuteServer}
      onToggleCompact={handleToggleCompact}
      onSignOut={handleSignOut}
      onProfileSaved={handleProfileSaved}
    />
  );
}
