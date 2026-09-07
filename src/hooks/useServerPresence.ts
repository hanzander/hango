"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserStatus } from "@/lib/types";

export type PresenceUser = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  voice_channel_id: string | null;
  online_at: string;
  status?: UserStatus;
  custom_status?: string | null;
};

type UseServerPresenceArgs = {
  serverId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  voiceChannelId?: string | null;
  status?: UserStatus;
  customStatus?: string | null;
  enabled?: boolean;
};

function membersEqual(a: PresenceUser[], b: PresenceUser[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.user_id !== y.user_id ||
      x.display_name !== y.display_name ||
      x.avatar_url !== y.avatar_url ||
      x.voice_channel_id !== y.voice_channel_id ||
      x.status !== y.status ||
      x.custom_status !== y.custom_status
    ) {
      return false;
    }
  }
  return true;
}

function readPresence(
  channel: NonNullable<
    ReturnType<ReturnType<typeof createClient>["channel"]>
  >,
): PresenceUser[] {
  const state = channel.presenceState<PresenceUser>();
  const next: PresenceUser[] = [];
  for (const key of Object.keys(state)) {
    const metas = state[key];
    if (!metas?.length) continue;
    next.push(metas[metas.length - 1]);
  }
  next.sort((a, b) =>
    a.display_name.localeCompare(b.display_name, undefined, {
      sensitivity: "base",
    }),
  );
  return next;
}

/**
 * Presence for online + in-voice + status. Voice/status changes flush immediately.
 */
export function useServerPresence({
  serverId,
  userId,
  displayName,
  avatarUrl = null,
  voiceChannelId = null,
  status = "online",
  customStatus = null,
  enabled = true,
}: UseServerPresenceArgs) {
  const [members, setMembers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const subscribedRef = useRef(false);

  const payloadRef = useRef({
    userId,
    displayName,
    avatarUrl,
    voiceChannelId,
    status,
    customStatus,
  });
  payloadRef.current = {
    userId,
    displayName,
    avatarUrl,
    voiceChannelId,
    status,
    customStatus,
  };

  const applyPresence = useCallback(
    (channel: NonNullable<typeof channelRef.current>) => {
      const next = readPresence(channel);
      setMembers((prev) => (membersEqual(prev, next) ? prev : next));
    },
    [],
  );

  const trackNow = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;
    const p = payloadRef.current;
    await channel.track({
      user_id: p.userId,
      display_name: p.displayName,
      avatar_url: p.avatarUrl,
      voice_channel_id: p.voiceChannelId,
      online_at: new Date().toISOString(),
      status: p.status === "invisible" ? "online" : p.status,
      custom_status: p.customStatus,
    } satisfies PresenceUser);
  }, []);

  useEffect(() => {
    if (!enabled || !serverId || !userId) return;

    const supabase = createClient();
    const channel = supabase.channel(`server-presence:${serverId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;
    subscribedRef.current = false;

    channel.on("presence", { event: "sync" }, () => applyPresence(channel));
    channel.on("presence", { event: "join" }, () => applyPresence(channel));
    channel.on("presence", { event: "leave" }, () => applyPresence(channel));

    void channel.subscribe(async (subStatus) => {
      if (subStatus !== "SUBSCRIBED") return;
      subscribedRef.current = true;
      await trackNow();
      applyPresence(channel);
    });

    return () => {
      subscribedRef.current = false;
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, serverId, userId, applyPresence, trackNow]);

  useEffect(() => {
    void trackNow();
  }, [
    trackNow,
    displayName,
    avatarUrl,
    voiceChannelId,
    status,
    customStatus,
  ]);

  const online = useMemo(() => members, [members]);

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
