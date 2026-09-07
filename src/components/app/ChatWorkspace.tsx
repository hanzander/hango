"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Channel, Message, Profile, Server } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/utils";
import { playMessageNotification } from "@/lib/call-sounds";

type ChatWorkspaceProps = {
  serverId?: string;
  channelId?: string;
  demo?: boolean;
};

export function ChatWorkspace({
  serverId,
  channelId,
  demo = false,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Keep URL in sync with resolved server/channel (skip mock demo route)
  useEffect(() => {
    if (demo || !activeServer || !activeChannel) return;
    if (serverId !== activeServer.id || channelId !== activeChannel.id) {
      router.replace(`/app/${activeServer.id}/${activeChannel.id}`);
    }
  }, [demo, activeServer, activeChannel, serverId, channelId, router]);

  const [demoMessages, setDemoMessages] = useState<Record<string, Message[]>>(
    () => {
      const map: Record<string, Message[]> = {};
      for (const ch of MOCK_CHANNELS) {
        map[ch.id] = getMockMessages(ch.id);
      }
      return map;
    },
  );

  // Demo / mock mode messages
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

  // Bootstrap supabase data
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

  // Load messages + realtime (text channels only)
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
      } else {
        setMessages((data as Message[]) ?? []);
      }
      setLoadingMessages(false);
    }

    loadMessages();

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

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, author: (author as Profile) ?? null }];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [configured, activeChannel]);

  // Server-wide chat notifications (like Discord) — ping when others message any text channel
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
          playMessageNotification();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, activeServer, channels, profile?.id]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeChannel) return;

      if (!configured) {
        const msg: Message = {
          id: `local-${Date.now()}`,
          channel_id: activeChannel.id,
          author_id: MOCK_PROFILE.id,
          content,
          created_at: new Date().toISOString(),
          author: MOCK_PROFILE,
        };
        setDemoMessages((prev) => ({
          ...prev,
          [activeChannel.id]: [...(prev[activeChannel.id] ?? []), msg],
        }));
        return;
      }

      if (!profile) return;
      const supabase = createClient();
      const { error } = await supabase.from("messages").insert({
        channel_id: activeChannel.id,
        author_id: profile.id,
        content,
      });
      if (error) throw error;
    },
    [activeChannel, configured, profile],
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

  const handleProfileSaved = useCallback(
    (next: { displayName: string; avatarUrl: string | null }) => {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              display_name: next.displayName,
              avatar_url: next.avatarUrl,
            }
          : prev,
      );
    },
    [],
  );

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
      displayName={profile?.display_name ?? "User"}
      avatarUrl={profile?.avatar_url}
      loadingMessages={loadingMessages}
      demo={demo}
      onSend={handleSend}
      onSignOut={handleSignOut}
      onProfileSaved={handleProfileSaved}
    />
  );
}
