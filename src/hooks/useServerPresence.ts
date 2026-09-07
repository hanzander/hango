"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PresenceUser = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  voice_channel_id: string | null;
  online_at: string;
};

type UseServerPresenceArgs = {
  serverId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  voiceChannelId?: string | null;
  enabled?: boolean;
};

export function useServerPresence({
  serverId,
  userId,
  displayName,
  avatarUrl = null,
  voiceChannelId = null,
  enabled = true,
}: UseServerPresenceArgs) {
  const [members, setMembers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const syncState = useCallback(
    (channel: NonNullable<typeof channelRef.current>) => {
      const state = channel.presenceState<PresenceUser>();
      const next: PresenceUser[] = [];
      for (const key of Object.keys(state)) {
        const metas = state[key];
        if (!metas?.length) continue;
        // Latest meta wins
        next.push(metas[metas.length - 1]);
      }
      next.sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, {
          sensitivity: "base",
        }),
      );
      setMembers(next);
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !serverId || !userId) return;

    const supabase = createClient();
    const channel = supabase.channel(`server-presence:${serverId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => syncState(channel));
    channel.on("presence", { event: "join" }, () => syncState(channel));
    channel.on("presence", { event: "leave" }, () => syncState(channel));

    void channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl,
        voice_channel_id: voiceChannelId,
        online_at: new Date().toISOString(),
      } satisfies PresenceUser);
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // Re-subscribe when server/user changes; voice updates happen via track below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, serverId, userId, syncState]);

  // Push voice channel / profile updates without resubscribing
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !enabled) return;
    void channel.track({
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      voice_channel_id: voiceChannelId,
      online_at: new Date().toISOString(),
    } satisfies PresenceUser);
  }, [
    enabled,
    userId,
    displayName,
    avatarUrl,
    voiceChannelId,
  ]);

  const online = useMemo(
    () => members.filter((m) => m.user_id),
    [members],
  );

  const inVoiceByChannel = useMemo(() => {
    const map: Record<string, PresenceUser[]> = {};
    for (const m of members) {
      if (!m.voice_channel_id) continue;
      (map[m.voice_channel_id] ??= []).push(m);
    }
    return map;
  }, [members]);

  return { online, inVoiceByChannel };
}
