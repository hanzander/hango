"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Component,
  memo,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Channel, Message, Profile, Server } from "@/lib/types";
import { ChannelList } from "./ChannelList";
import { MessagePane } from "./MessagePane";
import { MessageComposer } from "./MessageComposer";
import { UserBar } from "./UserBar";
import { VoiceConnectedBar } from "./VoiceConnectedBar";
import { MembersPanel, type ServerMember } from "./MembersPanel";
import { useServerPresence } from "@/hooks/useServerPresence";
import { createClient } from "@/lib/supabase/client";
import { playJoinSound, playLeaveSound, unlockAudio } from "@/lib/call-sounds";
import { ensureMicAccess, refreshMediaDevices } from "@/lib/media-devices";
import { cn } from "@/lib/utils";

const CallOverlay = dynamic(
  () => import("./CallOverlay").then((m) => m.CallOverlay),
  {
    ssr: false,
    loading: () => (
      <div className="relative flex min-h-0 flex-1 flex-col bg-[#050505]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.08), transparent 60%)",
          }}
        />
        <header className="relative z-10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <h1 className="text-sm font-semibold tracking-tight text-text">
              Connecting…
            </h1>
          </div>
        </header>
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4 pb-32">
          <div className="flex aspect-video w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-2xl bg-[#0c0c0c] ring-1 ring-white/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
              ···
            </div>
          </div>
        </div>
      </div>
    ),
  },
);

type AppShellProps = {
  server: Server;
  channels: Channel[];
  channel: Channel;
  messages: Message[];
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  loadingMessages?: boolean;
  demo?: boolean;
  onSend: (content: string) => Promise<void> | void;
  onSignOut?: () => void;
};

type VoiceSession = {
  channelId: string;
  channelName: string;
};

class CallErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Call crashed" };
  }

  render() {
    if (this.state.error) {
      return (
        <VoiceFrame>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-danger">Call hit a snag.</p>
            <p className="max-w-sm text-xs text-text-muted">{this.state.error}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
            >
              Try again
            </button>
          </div>
        </VoiceFrame>
      );
    }
    return this.props.children;
  }
}

function VoiceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#050505]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(ellipse 50% 50% at 80% 100%, rgba(255,255,255,0.03), transparent)",
        }}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function AppShell({
  server,
  channels,
  channel,
  messages,
  userId,
  displayName,
  avatarUrl,
  loadingMessages,
  demo,
  onSend,
  onSignOut,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceSession, setVoiceSession] = useState<VoiceSession | null>(null);
  const [callConnected, setCallConnected] = useState(false);
  const [callKey, setCallKey] = useState(0);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);
  const [liveRoster, setLiveRoster] = useState<
    { user_id: string; display_name: string }[]
  >([]);

  const inCall = voiceSession != null;
  const isVoice = (channel.kind ?? "text") === "voice";
  const viewingCallUi =
    inCall && voiceSession != null && channel.id === voiceSession.channelId;
  const homeHref = demo ? "/app/demo" : "/app";

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const hrefForChannel = useCallback(
    (c: Channel) =>
      demo ? `/app/demo?c=${c.id}` : `/app/${server.id}/${c.id}`,
    [demo, server.id],
  );

  const closeMobile = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!isVoice || demo) return;
    void import("./CallOverlay");
  }, [isVoice, demo]);

  // Leaving the server drops the call — switching channels does not
  useEffect(() => {
    setVoiceSession(null);
    setCallConnected(false);
    setLiveRoster([]);
  }, [server.id]);

  const handleCallConnected = useCallback(() => setCallConnected(true), []);
  const handleCallDisconnected = useCallback(() => {
    setCallConnected(false);
  }, []);
  const endVoiceSession = useCallback(() => {
    setCallConnected(false);
    setVoiceSession(null);
    setLiveRoster([]);
  }, []);
  const handleCallLeave = useCallback(() => {
    endVoiceSession();
  }, [endVoiceSession]);
  const handleCallReset = useCallback(() => {
    endVoiceSession();
    setCallKey((k) => k + 1);
  }, [endVoiceSession]);
  const handleRemoteRoster = useCallback(
    (peers: { user_id: string; display_name: string }[]) => {
      setLiveRoster(peers);
    },
    [],
  );

  const joinVoice = useCallback(() => {
    if ((channel.kind ?? "text") !== "voice") return;
    unlockAudio();
    playJoinSound();
    void ensureMicAccess().then((result) => {
      if (result.ok) {
        void refreshMediaDevices("audiooutput");
        void refreshMediaDevices("videoinput");
      }
    });
    setCallConnected(false);
    setVoiceSession({ channelId: channel.id, channelName: channel.name });
  }, [channel.id, channel.kind, channel.name]);

  const disconnectVoice = useCallback(() => {
    playLeaveSound();
    endVoiceSession();
    setCallKey((k) => k + 1);
  }, [endVoiceSession]);

  useEffect(() => {
    if (demo || !server.id) return;
    let cancelled = false;
    const supabase = createClient();

    async function loadMembers() {
      const { data } = await supabase
        .from("server_members")
        .select("user_id, profiles(id, display_name, avatar_url)")
        .eq("server_id", server.id);

      if (cancelled) return;

      const rows: ServerMember[] = (data ?? [])
        .map((row) => {
          const profile = row.profiles as Profile | Profile[] | null;
          const p = Array.isArray(profile) ? profile[0] : profile;
          if (!p) return null;
          return {
            id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          };
        })
        .filter(Boolean) as ServerMember[];

      rows.sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, {
          sensitivity: "base",
        }),
      );
      setServerMembers(rows);
    }

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [demo, server.id]);

  const voiceChannelId =
    inCall && voiceSession ? voiceSession.channelId : null;

  const { online, inVoiceByChannel } = useServerPresence({
    serverId: server.id,
    userId: userId || "anon",
    displayName,
    avatarUrl,
    voiceChannelId,
    enabled: !demo && Boolean(userId),
  });

  const voiceOccupants = (() => {
    const map: typeof inVoiceByChannel = { ...inVoiceByChannel };
    if (inCall && voiceSession && userId) {
      const vid = voiceSession.channelId;
      const existing = map[vid] ?? [];
      const byId = new Map(existing.map((u) => [u.user_id, u]));

      byId.set(userId, {
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl ?? byId.get(userId)?.avatar_url ?? null,
        voice_channel_id: vid,
        online_at: byId.get(userId)?.online_at ?? new Date().toISOString(),
      });

      for (const p of liveRoster) {
        if (p.user_id === userId) continue;
        const prev = byId.get(p.user_id);
        byId.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.display_name || prev?.display_name || "User",
          avatar_url: prev?.avatar_url ?? null,
          voice_channel_id: vid,
          online_at: prev?.online_at ?? new Date().toISOString(),
        });
      }

      map[vid] = Array.from(byId.values());
    }
    return map;
  })();

  const occupants = isVoice
    ? (voiceOccupants[channel.id]?.length ?? 0)
    : 0;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <ChannelList
            server={server}
            channels={channels}
            activeChannelId={channel.id}
            onCloseMobile={closeMobile}
            hrefForChannel={hrefForChannel}
            homeHref={homeHref}
            voiceOccupants={voiceOccupants}
          />
          {inCall && voiceSession && !demo && (
            <VoiceConnectedBar
              channelName={voiceSession.channelName}
              channelHref={
                demo
                  ? `/app/demo?c=${voiceSession.channelId}`
                  : `/app/${server.id}/${voiceSession.channelId}`
              }
              connected={callConnected}
              onDisconnect={disconnectVoice}
            />
          )}
          <UserBar
            displayName={displayName}
            avatarUrl={avatarUrl}
            onSignOut={onSignOut}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary"
            aria-label="Open channels"
          >
            Menu
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {isVoice ? channel.name : `#${channel.name}`}
          </span>
          <Link
            href={homeHref}
            className="text-[11px] text-text-muted hover:text-text"
          >
            Leave
          </Link>
        </div>

        {/* Keep LiveKit mounted while browsing other channels */}
        {inCall && voiceSession && !demo && (
          <div
            className={cn(
              viewingCallUi
                ? "flex min-h-0 flex-1 flex-col"
                : "pointer-events-none fixed left-0 top-0 z-[-1] h-px w-px overflow-hidden opacity-0",
            )}
            aria-hidden={!viewingCallUi}
          >
            <CallErrorBoundary onReset={handleCallReset}>
              <MemoCallSlot
                channelId={voiceSession.channelId}
                callKey={callKey}
                channelName={voiceSession.channelName}
                displayName={displayName}
                onConnected={handleCallConnected}
                onDisconnected={handleCallDisconnected}
                onLeave={handleCallLeave}
                onRemoteRoster={handleRemoteRoster}
              />
            </CallErrorBoundary>
          </div>
        )}

        {!viewingCallUi &&
          (isVoice ? (
            demo ? (
              <VoiceFrame>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm text-text-secondary">
                    Voice preview — sign in to join real calls.
                  </p>
                </div>
              </VoiceFrame>
            ) : inCall &&
              voiceSession &&
              channel.id !== voiceSession.channelId ? (
              <VoiceFrame>
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                  <p className="text-sm text-text-secondary">
                    You’re connected to{" "}
                    <span className="font-medium text-text">
                      {voiceSession.channelName}
                    </span>
                    .
                  </p>
                  <Link
                    href={hrefForChannel({
                      ...channel,
                      id: voiceSession.channelId,
                      name: voiceSession.channelName,
                      kind: "voice",
                    } as Channel)}
                    className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-medium text-black hover:bg-emerald-400"
                  >
                    Return to {voiceSession.channelName}
                  </Link>
                </div>
              </VoiceFrame>
            ) : (
              <VoiceFrame>
                <header className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400/50" />
                      <h1 className="text-sm font-semibold tracking-tight text-text">
                        {channel.name}
                      </h1>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {occupants > 0
                        ? `${occupants} in call`
                        : "No one here yet"}
                    </p>
                  </div>
                </header>
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-24">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold text-text">
                      {channel.name}
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {occupants > 0
                        ? `${occupants} already here`
                        : "Ready when you are"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={joinVoice}
                    className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-emerald-400"
                  >
                    Join voice
                  </button>
                </div>
              </VoiceFrame>
            )
          ) : (
            <>
              <MessagePane
                channelName={channel.name}
                messages={messages}
                loading={loadingMessages}
              />
              <MessageComposer channelName={channel.name} onSend={onSend} />
            </>
          ))}
      </div>

      {!demo && (
        <MembersPanel
          serverMembers={serverMembers}
          online={(() => {
            const byId = new Map(online.map((u) => [u.user_id, u]));
            if (inCall && voiceSession && userId) {
              const self = byId.get(userId);
              byId.set(userId, {
                user_id: userId,
                display_name: self?.display_name || displayName,
                avatar_url: self?.avatar_url ?? avatarUrl ?? null,
                voice_channel_id: voiceSession.channelId,
                online_at: self?.online_at ?? new Date().toISOString(),
              });
              for (const p of liveRoster) {
                const prev = byId.get(p.user_id);
                byId.set(p.user_id, {
                  user_id: p.user_id,
                  display_name: p.display_name || prev?.display_name || "User",
                  avatar_url: prev?.avatar_url ?? null,
                  voice_channel_id: voiceSession.channelId,
                  online_at: prev?.online_at ?? new Date().toISOString(),
                });
              }
            }
            return Array.from(byId.values());
          })()}
        />
      )}
    </div>
  );
}

const MemoCallSlot = memo(function MemoCallSlot({
  channelId,
  callKey,
  channelName,
  displayName,
  onConnected,
  onDisconnected,
  onLeave,
  onRemoteRoster,
}: {
  channelId: string;
  callKey: number;
  channelName: string;
  displayName: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onLeave: () => void;
  onRemoteRoster: (
    peers: { user_id: string; display_name: string }[],
  ) => void;
}) {
  return (
    <CallOverlay
      key={`${channelId}-${callKey}`}
      channelId={channelId}
      channelName={channelName}
      displayName={displayName}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      onLeave={onLeave}
      onRemoteRoster={onRemoteRoster}
    />
  );
});
