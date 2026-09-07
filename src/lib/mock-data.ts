import type { Channel, Message, Profile, Server } from "./types";

export const MOCK_PROFILE: Profile = {
  id: "user-demo",
  display_name: "You",
  avatar_url: null,
};

export const MOCK_SERVERS: Server[] = [
  {
    id: "srv-lounge",
    name: "Hango Lounge",
    icon_url: null,
    owner_id: "user-demo",
    invite_code: "demo0001",
  },
];

export const MOCK_CHANNELS: Channel[] = [
  {
    id: "ch-general",
    server_id: "srv-lounge",
    name: "general",
    position: 0,
    kind: "text",
  },
  {
    id: "ch-random",
    server_id: "srv-lounge",
    name: "random",
    position: 1,
    kind: "text",
  },
  {
    id: "ch-voice",
    server_id: "srv-lounge",
    name: "Lounge",
    position: 2,
    kind: "voice",
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: "msg-1",
    channel_id: "ch-general",
    author_id: "bot-hango",
    content: "Welcome to Hango — clean chat for people who hang out.",
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    author: {
      id: "bot-hango",
      display_name: "Hango",
      avatar_url: null,
    },
  },
  {
    id: "msg-2",
    channel_id: "ch-general",
    author_id: "user-alex",
    content: "This layout feels sleek. Dark mode only — the way it should be.",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    author: {
      id: "user-alex",
      display_name: "Alex",
      avatar_url: null,
    },
  },
  {
    id: "msg-3",
    channel_id: "ch-random",
    author_id: "user-sam",
    content: "Ship the web app first. Electron can wait.",
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    author: {
      id: "user-sam",
      display_name: "Sam",
      avatar_url: null,
    },
  },
];

export function getMockChannels(serverId: string) {
  return MOCK_CHANNELS.filter((c) => c.server_id === serverId).sort(
    (a, b) => a.position - b.position,
  );
}

export function getMockMessages(channelId: string) {
  return MOCK_MESSAGES.filter((m) => m.channel_id === channelId).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
