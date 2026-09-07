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
  MessageAttachment,
  MessageReaction,
  Profile,
  Server,
} from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/utils";
import { playMessageNotification } from "@/lib/call-sounds";
import { useToast } from "@/components/ui/Toast";
import type { SendPayload } from "@/components/app/MessageComposer";
import { extractUrls } from "@/lib/embeds";
import {
  ensureNotificationPermission,
  notifyDesktop,
} from "@/lib/desktop-notify";
import { useIdleStatus } from "@/hooks/useIdleStatus";
import {
  isNotificationLevel,
  messageMentionsMe,
  resolveNotificationLevel,
  type NotificationLevel,
} from "@/lib/permissions";

type ChatWorkspaceProps = {
  serverId?: string;
  channelId?: string;
  demo?: boolean;
};

function asProfile(raw: unknown): Profile | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as Profile) ?? null;
  return raw as Profile;
}

function enrichMessages(
  rows: Message[],
  replyMap: Map<string, Message>,
  reactionsByMsg: Map<string, MessageReaction[]>,
  attachmentsByMsg: Map<string, MessageAttachment[]>,
): Message[] {
  return rows.map((m) => {
    const author = asProfile(m.author);
    const reply = m.reply_to_id ? replyMap.get(m.reply_to_id) ?? null : null;
    return {
      ...m,
      author,
      reply_to: reply
        ? { ...reply, author: asProfile(reply.author) }
        : null,
      reactions: reactionsByMsg.get(m.id) ?? [],
      attachments: attachmentsByMsg.get(m.id) ?? m.attachments ?? [],
    };
  });
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
  const [channelNotifLevels, setChannelNotifLevels] = useState<
    Record<string, NotificationLevel>
  >({});
  const [serverNotifLevels, setServerNotifLevels] = useState<
    Record<string, NotificationLevel>
  >({});
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinsOnly, setPinsOnly] = useState(false);
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
    setSearchQuery("");
    setPinsOnly(false);
    if (activeChannel?.id) {
      setUnreadChannels((prev) => {
        if (!prev.has(activeChannel.id)) return prev;
        const next = new Set(prev);
        next.delete(activeChannel.id);
        return next;
      });
      // Persist read state
      if (configured && profile?.id) {
        const supabase = createClient();
        void supabase.from("channel_read_state").upsert({
          user_id: profile.id,
          channel_id: activeChannel.id,
          last_read_at: new Date().toISOString(),
        });
      }
    }
  }, [activeChannel?.id, configured, profile?.id]);

  useIdleStatus({
    userId: profile?.id ?? "",
    enabled: configured && Boolean(profile?.id),
    status: profile?.status,
    onStatus: (s) =>
      setProfile((prev) => (prev ? { ...prev, status: s } : prev)),
  });

  // Request desktop notification permission once after login
  useEffect(() => {
    if (!configured || !profile?.id) return;
    void ensureNotificationPermission();
  }, [configured, profile?.id]);

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
        .select("channel_id, notification_level");
      const { data: serverMuteRows } = await supabase
        .from("server_mutes")
        .select("server_id, notification_level");
      // Mute tables may not exist until migration 005 — ignore errors

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

      const chLevels: Record<string, NotificationLevel> = {};
      const chMuted = new Set<string>();
      for (const row of channelMuteRows ?? []) {
        const id = row.channel_id as string;
        const level = isNotificationLevel(row.notification_level)
          ? row.notification_level
          : "nothing";
        chLevels[id] = level;
        if (level === "nothing") chMuted.add(id);
      }
      const srvLevels: Record<string, NotificationLevel> = {};
      const srvMuted = new Set<string>();
      for (const row of serverMuteRows ?? []) {
        const id = row.server_id as string;
        const level = isNotificationLevel(row.notification_level)
          ? row.notification_level
          : "nothing";
        srvLevels[id] = level;
        if (level === "nothing") srvMuted.add(id);
      }
      setChannelNotifLevels(chLevels);
      setServerNotifLevels(srvLevels);
      setMutedChannels(chMuted);
      setMutedServers(srvMuted);
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
    const channelId = activeChannel.id;

    async function loadMessages() {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*, author:profiles!author_id(*)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (error) {
        console.error(error);
        toast(error.message || "Failed to load messages", "danger");
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
          .select("*, author:profiles!author_id(*)")
          .in("id", replyIds);
        for (const r of (replies as Message[]) ?? []) {
          replyMap.set(r.id, r);
        }
      }

      const msgIds = rows.map((m) => m.id);
      const reactionsByMsg = new Map<string, MessageReaction[]>();
      const attachmentsByMsg = new Map<string, MessageAttachment[]>();
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
        const { data: atts, error: attErr } = await supabase
          .from("message_attachments")
          .select("*")
          .in("message_id", msgIds);
        if (!attErr) {
          for (const a of (atts as MessageAttachment[]) ?? []) {
            const list = attachmentsByMsg.get(a.message_id) ?? [];
            list.push(a);
            attachmentsByMsg.set(a.message_id, list);
          }
        }
      }

      if (cancelled) return;
      setMessages(
        enrichMessages(rows, replyMap, reactionsByMsg, attachmentsByMsg),
      );
      setLoadingMessages(false);
    }

    void loadMessages();

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          if (row.deleted_at) return;
          const { data: author } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", row.author_id)
            .single();

          let reply_to: Message | null = null;
          if (row.reply_to_id) {
            const { data: parent } = await supabase
              .from("messages")
              .select("*, author:profiles!author_id(*)")
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
                author: asProfile(author) ?? null,
                reply_to: reply_to
                  ? { ...reply_to, author: asProfile(reply_to.author) }
                  : null,
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
          filter: `channel_id=eq.${channelId}`,
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
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
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

    // Reactions on a separate channel so a missing table/publication can't break chat
    const reactionsChannel = supabase
      .channel(`reactions:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async () => {
          const { data } = await supabase
            .from("messages")
            .select("id")
            .eq("channel_id", channelId)
            .limit(200);
          const msgIds = ((data as { id: string }[]) ?? []).map((r) => r.id);
          if (!msgIds.length) return;
          const { data: reactions, error } = await supabase
            .from("message_reactions")
            .select("*")
            .in("message_id", msgIds);
          if (error) return;
          const byMsg = new Map<string, MessageReaction[]>();
          for (const r of (reactions as MessageReaction[]) ?? []) {
            const list = byMsg.get(r.message_id) ?? [];
            list.push(r);
            byMsg.set(r.message_id, list);
          }
          setMessages((prev) =>
            prev.map((m) => ({ ...m, reactions: byMsg.get(m.id) ?? [] })),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      typingChannelRef.current = null;
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(reactionsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on channel change
  }, [configured, activeChannel?.id, profile?.id, toast]);

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

          const level = resolveNotificationLevel(
            serverNotifLevels[activeServer.id],
            channelNotifLevels[row.channel_id],
            mutedServers.has(activeServer.id),
            mutedChannels.has(row.channel_id),
          );
          if (level === "nothing") return;

          const mentioned = messageMentionsMe(row.content, myName);
          if (level === "mentions" && !mentioned) return;

          // Legacy global toggle (UserBar) still respected if set
          const mentionsOnly =
            typeof window !== "undefined" &&
            localStorage.getItem("hango-mentions-only") === "1";
          if (mentionsOnly && level === "all" && !mentioned) return;

          playMessageNotification();
          void ensureNotificationPermission().then((perm) => {
            if (perm !== "granted") return;
            notifyDesktop(
              `New message in #${channels.find((c) => c.id === row.channel_id)?.name ?? "chat"}`,
              row.content.slice(0, 120) || "Attachment",
              { tag: `msg-${row.channel_id}` },
            );
          });
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
    channelNotifLevels,
    serverNotifLevels,
  ]);

  const handleSend = useCallback(
    async (payload: SendPayload) => {
      if (!activeChannel) return;
      const {
        content: rawContent,
        replyToId,
        files = [],
        gifUrl,
        gifName,
      } = payload;
      const content = rawContent.trim();
      if (!content && files.length === 0 && !gifUrl) return;

      if (!configured) {
        const localAtts: MessageAttachment[] = [
          ...files.map((f, i) => ({
            id: `local-a-${Date.now()}-${i}`,
            message_id: "",
            url: URL.createObjectURL(f),
            filename: f.name,
            content_type: f.type,
          })),
          ...(gifUrl
            ? [
                {
                  id: `local-gif-${Date.now()}`,
                  message_id: "",
                  url: gifUrl,
                  filename: gifName || "gif.gif",
                  content_type: "image/gif",
                },
              ]
            : []),
        ];
        const msg: Message = {
          id: `local-${Date.now()}`,
          channel_id: activeChannel.id,
          author_id: MOCK_PROFILE.id,
          content: content || (gifUrl ? "GIF" : " "),
          created_at: new Date().toISOString(),
          reply_to_id: replyToId ?? null,
          author: MOCK_PROFILE,
          reply_to: replyToId
            ? (demoMessages[activeChannel.id] ?? []).find(
                (m) => m.id === replyToId,
              ) ?? null
            : null,
          reactions: [],
          attachments: localAtts.map((a) => ({ ...a, message_id: `local-${Date.now()}` })),
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

      const body = content || (gifUrl || files.length ? " " : "");
      const insertPayload: Record<string, unknown> = {
        channel_id: activeChannel.id,
        author_id: profile.id,
        content: body,
      };
      if (replyToId) insertPayload.reply_to_id = replyToId;

      // Optional OG embed for first link
      const firstUrl = extractUrls(content)[0];
      if (firstUrl) {
        try {
          const emb = await fetch(
            `/api/embed?url=${encodeURIComponent(firstUrl)}`,
          ).then((r) => r.json());
          if (emb?.url) insertPayload.embed_json = emb;
        } catch {
          /* ignore */
        }
      }

      let row: Message | null = null;
      const { data, error } = await supabase
        .from("messages")
        .insert(insertPayload)
        .select("*, author:profiles!author_id(*)")
        .single();

      if (error) {
        if (/content/i.test(error.message) && body === " ") {
          const retry = await supabase
            .from("messages")
            .insert({ ...insertPayload, content: gifUrl ? "GIF" : "📎" })
            .select("*, author:profiles!author_id(*)")
            .single();
          if (retry.error) {
            toast(retry.error.message, "danger");
            throw retry.error;
          }
          row = retry.data as Message;
        } else {
          toast(error.message, "danger");
          throw error;
        }
      } else {
        row = data as Message;
      }

      if (!row?.id) {
        toast("Message send failed", "danger");
        throw new Error("empty");
      }
      const messageId = row.id;

      const attachments: MessageAttachment[] = [];

      async function uploadFile(file: File, forcedName?: string) {
        const safe = (forcedName || file.name).replace(/[^\w.\-]+/g, "_");
        const path = `${profile!.id}/${activeChannel!.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("chat-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast(upErr.message, "danger");
          return;
        }
        const { data: pub } = supabase.storage
          .from("chat-media")
          .getPublicUrl(path);
        const { data: att, error: attErr } = await supabase
          .from("message_attachments")
          .insert({
            message_id: messageId,
            url: pub.publicUrl,
            filename: forcedName || file.name,
            content_type: file.type || "application/octet-stream",
            size_bytes: file.size,
          })
          .select("*")
          .single();
        if (!attErr && att) attachments.push(att as MessageAttachment);
        else if (attErr) toast(attErr.message, "danger");
      }

      for (const file of files) {
        await uploadFile(file);
      }

      if (gifUrl) {
        // Store remote GIF URL as attachment (no re-upload)
        const { data: att, error: attErr } = await supabase
          .from("message_attachments")
          .insert({
            message_id: messageId,
            url: gifUrl,
            filename: gifName || "tenor.gif",
            content_type: "image/gif",
          })
          .select("*")
          .single();
        if (!attErr && att) attachments.push(att as MessageAttachment);
        else if (attErr) {
          // Fallback: show gif via content link only
          attachments.push({
            id: `tmp-${Date.now()}`,
            message_id: messageId,
            url: gifUrl,
            filename: gifName || "tenor.gif",
            content_type: "image/gif",
          });
        }
      }

      const reply_to = replyToId
        ? messages.find((m) => m.id === replyToId) ?? null
        : null;
      const sent = row;

      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) {
          return prev.map((m) =>
            m.id === sent.id
              ? { ...m, attachments: [...(m.attachments ?? []), ...attachments] }
              : m,
          );
        }
        return [
          ...prev,
          {
            ...sent,
            author: asProfile(sent.author) ?? profile,
            reply_to,
            reactions: [],
            attachments,
          },
        ];
      });
      setReplyTo(null);
    },
    [activeChannel, configured, profile, demoMessages, toast, messages],
  );

  const handlePin = useCallback(
    async (messageId: string, pin: boolean) => {
      if (!configured || !profile) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("messages")
        .update(
          pin
            ? { pinned_at: new Date().toISOString(), pinned_by: profile.id }
            : { pinned_at: null, pinned_by: null },
        )
        .eq("id", messageId);
      if (error) {
        toast(error.message, "danger");
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pinned_at: pin ? new Date().toISOString() : null,
                pinned_by: pin ? profile.id : null,
              }
            : m,
        ),
      );
      toast(pin ? "Message pinned" : "Message unpinned", "success");
    },
    [configured, profile, toast],
  );

  const handleStartThread = useCallback(
    async (message: Message) => {
      if (!configured || !profile || !activeChannel) return;
      const supabase = createClient();
      const name = message.content.slice(0, 40) || "Thread";
      const { data, error } = await supabase
        .from("threads")
        .insert({
          channel_id: activeChannel.id,
          root_message_id: message.id,
          name,
          created_by: profile.id,
        })
        .select("*")
        .single();
      if (error) {
        toast(
          /relation|threads/i.test(error.message)
            ? "Run migration 006 for threads"
            : error.message,
          "danger",
        );
        return;
      }
      await supabase
        .from("messages")
        .update({ thread_id: (data as { id: string }).id })
        .eq("id", message.id);
      toast(`Thread “${name}” started`, "success");
    },
    [configured, profile, activeChannel, toast],
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
      let { error } = await supabase
        .from("messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", messageId);
      // edited_at may not exist until migration 005
      if (error && /edited_at/i.test(error.message)) {
        ({ error } = await supabase
          .from("messages")
          .update({ content })
          .eq("id", messageId));
      }
      if (error) {
        toast(error.message, "danger");
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content, edited_at: new Date().toISOString() }
            : m,
        ),
      );
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
      // Prefer soft-delete; fall back to hard delete if migration 005 missing
      let { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), content: "." })
        .eq("id", messageId);
      if (error && /deleted_at/i.test(error.message)) {
        ({ error } = await supabase
          .from("messages")
          .delete()
          .eq("id", messageId));
      }
      if (error) {
        toast(error.message, "danger");
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
      const localMine = messages
        .find((m) => m.id === messageId)
        ?.reactions?.find(
          (r) => r.user_id === profile.id && r.emoji === emoji,
        );

      // Optimistically flip UI
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const list = m.reactions ?? [];
          if (localMine) {
            return {
              ...m,
              reactions: list.filter(
                (r) => !(r.user_id === profile.id && r.emoji === emoji),
              ),
            };
          }
          return {
            ...m,
            reactions: [
              ...list,
              { message_id: messageId, user_id: profile.id, emoji },
            ],
          };
        }),
      );

      if (localMine) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", profile.id)
          .eq("emoji", emoji);
        if (error) toast(error.message, "danger");
        return;
      }

      const { error } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: profile.id,
        emoji,
      });
      if (error) {
        // Already reacted (stale local state) → treat as toggle off
        if (/duplicate|unique/i.test(error.message)) {
          await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", profile.id)
            .eq("emoji", emoji);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: (m.reactions ?? []).filter(
                      (r) =>
                        !(r.user_id === profile.id && r.emoji === emoji),
                    ),
                  }
                : m,
            ),
          );
          return;
        }
        toast(error.message, "danger");
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

  const handleSetChannelNotif = useCallback(
    async (channelIdToSet: string, level: NotificationLevel) => {
      if (!profile || !configured) return;
      const supabase = createClient();
      if (level === "all") {
        await supabase
          .from("channel_mutes")
          .delete()
          .eq("user_id", profile.id)
          .eq("channel_id", channelIdToSet);
        setChannelNotifLevels((prev) => {
          const next = { ...prev };
          delete next[channelIdToSet];
          return next;
        });
        setMutedChannels((prev) => {
          const next = new Set(prev);
          next.delete(channelIdToSet);
          return next;
        });
        toast("Channel notifications: all");
        return;
      }
      const { error } = await supabase.from("channel_mutes").upsert({
        user_id: profile.id,
        channel_id: channelIdToSet,
        notification_level: level,
      });
      if (error) {
        await supabase.from("channel_mutes").upsert({
          user_id: profile.id,
          channel_id: channelIdToSet,
        });
      }
      setChannelNotifLevels((prev) => ({ ...prev, [channelIdToSet]: level }));
      setMutedChannels((prev) => {
        const next = new Set(prev);
        if (level === "nothing") next.add(channelIdToSet);
        else next.delete(channelIdToSet);
        return next;
      });
      toast(
        level === "mentions"
          ? "Channel: mentions only"
          : "Channel notifications off",
      );
    },
    [profile, configured, toast],
  );

  const handleSetServerNotif = useCallback(
    async (level: NotificationLevel) => {
      if (!profile || !configured || !activeServer) return;
      const supabase = createClient();
      if (level === "all") {
        await supabase
          .from("server_mutes")
          .delete()
          .eq("user_id", profile.id)
          .eq("server_id", activeServer.id);
        setServerNotifLevels((prev) => {
          const next = { ...prev };
          delete next[activeServer.id];
          return next;
        });
        setMutedServers((prev) => {
          const next = new Set(prev);
          next.delete(activeServer.id);
          return next;
        });
        toast("Server notifications: all");
        return;
      }
      const { error } = await supabase.from("server_mutes").upsert({
        user_id: profile.id,
        server_id: activeServer.id,
        notification_level: level,
      });
      if (error) {
        await supabase.from("server_mutes").upsert({
          user_id: profile.id,
          server_id: activeServer.id,
        });
      }
      setServerNotifLevels((prev) => ({
        ...prev,
        [activeServer.id]: level,
      }));
      setMutedServers((prev) => {
        const next = new Set(prev);
        if (level === "nothing") next.add(activeServer.id);
        else next.delete(activeServer.id);
        return next;
      });
      toast(
        level === "mentions"
          ? "Server: mentions only"
          : "Server notifications off",
      );
    },
    [profile, configured, activeServer, toast],
  );

  const handleMuteChannel = useCallback(
    async (channelIdToMute: string, mute: boolean) => {
      await handleSetChannelNotif(channelIdToMute, mute ? "nothing" : "all");
    },
    [handleSetChannelNotif],
  );

  const handleMuteServer = useCallback(
    async (mute: boolean) => {
      await handleSetServerNotif(mute ? "nothing" : "all");
    },
    [handleSetServerNotif],
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
    setMessages((prev) =>
      prev.map((m) =>
        m.author_id === next.id
          ? {
              ...m,
              author: {
                ...(m.author ?? {}),
                ...next,
              },
            }
          : m,
      ),
    );
  }, []);

  const handleMarkServerRead = useCallback(async () => {
    if (!activeServer) return;
    const ids = channels
      .filter((c) => c.server_id === activeServer.id)
      .map((c) => c.id);
    setUnreadChannels((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (configured && profile?.id) {
      const supabase = createClient();
      const now = new Date().toISOString();
      await supabase.from("channel_read_state").upsert(
        ids.map((channel_id) => ({
          user_id: profile.id,
          channel_id,
          last_read_at: now,
        })),
      );
    }
    toast("Marked as read", "success");
  }, [activeServer, channels, configured, profile?.id, toast]);

  const handleUpdateTopic = useCallback(
    async (topic: string) => {
      if (!activeChannel || !configured) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("channels")
        .update({ topic: topic || null })
        .eq("id", activeChannel.id);
      if (error) {
        toast(error.message, "danger");
        return;
      }
      setChannels((prev) =>
        prev.map((c) =>
          c.id === activeChannel.id ? { ...c, topic: topic || null } : c,
        ),
      );
      toast("Topic updated", "success");
    },
    [activeChannel, configured, toast],
  );

  const handleKick = useCallback(
    async (userId: string) => {
      if (!activeServer) return;
      const supabase = createClient();
      const { error } = await supabase.rpc("kick_member", {
        p_server_id: activeServer.id,
        p_user_id: userId,
      });
      if (error) {
        toast(error.message, "danger");
        return;
      }
      toast("Member kicked", "success");
    },
    [activeServer, toast],
  );

  const handleTimeout = useCallback(
    async (userId: string, minutes: number) => {
      if (!activeServer) return;
      const supabase = createClient();
      const { error } = await supabase.rpc("timeout_member", {
        p_server_id: activeServer.id,
        p_user_id: userId,
        p_minutes: minutes,
      });
      if (error) {
        toast(error.message, "danger");
        return;
      }
      toast(`Timed out ${minutes}m`, "success");
    },
    [activeServer, toast],
  );

  const handleAssignRole = useCallback(
    async (userId: string, roleId: string) => {
      if (!activeServer) return;
      const supabase = createClient();
      const { error } = await supabase.from("member_roles").upsert({
        server_id: activeServer.id,
        user_id: userId,
        role_id: roleId,
      });
      if (error) {
        toast(error.message, "danger");
        return;
      }
      toast("Role assigned", "success");
    },
    [activeServer, toast],
  );

  const handleRemoveRole = useCallback(
    async (userId: string, roleId: string) => {
      if (!activeServer) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("member_roles")
        .delete()
        .eq("server_id", activeServer.id)
        .eq("user_id", userId)
        .eq("role_id", roleId);
      if (error) {
        toast(error.message, "danger");
        return;
      }
      toast("Role removed", "success");
    },
    [activeServer, toast],
  );

  const handleOpenDm = useCallback(
    async (otherUserId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("open_dm", {
        p_other_user: otherUserId,
      });
      if (error) {
        toast(error.message, "danger");
        return;
      }
      const ch = Array.isArray(data) ? data[0] : data;
      if (ch?.id) router.push(`/app/dm/${ch.id}`);
    },
    [router, toast],
  );

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
      servers={servers}
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
      searchQuery={searchQuery}
      pinsOnly={pinsOnly}
      onSend={handleSend}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onReact={handleReact}
      onPin={handlePin}
      onStartThread={handleStartThread}
      onReply={setReplyTo}
      onCancelReply={() => setReplyTo(null)}
      onTyping={handleTyping}
      onCreateChannel={handleCreateChannel}
      onMuteChannel={handleMuteChannel}
      onMuteServer={handleMuteServer}
      onSetChannelNotif={handleSetChannelNotif}
      onSetServerNotif={handleSetServerNotif}
      channelNotifLevels={channelNotifLevels}
      serverNotifLevel={
        serverNotifLevels[activeServer.id] ??
        (mutedServers.has(activeServer.id) ? "nothing" : "all")
      }
      onToggleCompact={handleToggleCompact}
      onSearchChange={setSearchQuery}
      onTogglePins={() => {
        setPinsOnly((v) => !v);
        setSearchQuery("");
      }}
      onMarkServerRead={handleMarkServerRead}
      onUpdateTopic={handleUpdateTopic}
      onKick={handleKick}
      onTimeout={handleTimeout}
      onAssignRole={handleAssignRole}
      onRemoveRole={handleRemoveRole}
      onMessageUser={handleOpenDm}
      onServerUpdated={(patch) =>
        setServers((prev) =>
          prev.map((s) =>
            s.id === activeServer.id ? { ...s, ...patch } : s,
          ),
        )
      }
      onServersChanged={async () => {
        if (!configured) return;
        const supabase = createClient();
        const { data: memberRows } = await supabase
          .from("server_members")
          .select("server_id");
        const serverIds = (memberRows ?? []).map((m) => m.server_id);
        if (!serverIds.length) {
          setServers([]);
          setChannels([]);
          return;
        }
        const { data: serverRows } = await supabase
          .from("servers")
          .select("*")
          .in("id", serverIds);
        const { data: channelRows } = await supabase
          .from("channels")
          .select("*")
          .in("server_id", serverIds)
          .order("position");
        setServers((serverRows as Server[]) ?? []);
        setChannels((channelRows as Channel[]) ?? []);
      }}
      onSignOut={handleSignOut}
      onProfileSaved={handleProfileSaved}
    />
  );
}
