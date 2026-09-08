/**
 * Client session cache so leaving / re-entering a server feels instant.
 */

import type { Channel, Profile, Server } from "@/lib/types";
import type { NotificationLevel } from "@/lib/permissions";

const LAST_CHANNEL_PREFIX = "hango-last-channel:";

export type AppBootstrapCache = {
  userId: string;
  profile: Profile;
  servers: Server[];
  channels: Channel[];
  channelNotifLevels: Record<string, NotificationLevel>;
  serverNotifLevels: Record<string, NotificationLevel>;
  mutedChannels: string[];
  mutedServers: string[];
  savedAt: number;
};

let memoryCache: AppBootstrapCache | null = null;

export function getAppBootstrapCache(): AppBootstrapCache | null {
  return memoryCache;
}

export function setAppBootstrapCache(cache: AppBootstrapCache | null) {
  memoryCache = cache;
}

export function getLastChannelId(serverId: string): string | null {
  if (typeof window === "undefined" || !serverId) return null;
  try {
    return localStorage.getItem(`${LAST_CHANNEL_PREFIX}${serverId}`);
  } catch {
    return null;
  }
}

export function setLastChannelId(serverId: string, channelId: string) {
  if (typeof window === "undefined" || !serverId || !channelId) return;
  try {
    localStorage.setItem(`${LAST_CHANNEL_PREFIX}${serverId}`, channelId);
  } catch {
    /* ignore */
  }
}

/** Prefer last-visited channel so we skip the slow /app/[serverId] RSC lookup. */
export function getServerEnterHref(
  serverId: string,
  channels?: Channel[],
): string {
  const last = getLastChannelId(serverId);
  if (last) return `/app/${serverId}/${last}`;
  const fromCache =
    channels?.find(
      (c) => c.server_id === serverId && (c.kind ?? "text") === "text",
    ) ?? channels?.find((c) => c.server_id === serverId);
  if (fromCache) return `/app/${serverId}/${fromCache.id}`;
  const boot = memoryCache?.channels.find(
    (c) => c.server_id === serverId && (c.kind ?? "text") === "text",
  ) ?? memoryCache?.channels.find((c) => c.server_id === serverId);
  if (boot) return `/app/${serverId}/${boot.id}`;
  return `/app/${serverId}`;
}
