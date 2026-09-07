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
import { MessageComposer, type SendPayload } from "./MessageComposer";
import { UserBar } from "./UserBar";
import { VoiceConnectedBar } from "./VoiceConnectedBar";
import { ProfileEditor } from "./ProfileEditor";
import { UserProfilePopout } from "./UserProfilePopout";
import { CreateChannelModal } from "./CreateChannelModal";
import { RolesModal } from "./RolesModal";
import { ServerSearch } from "./ServerSearch";
import { EmojiManager } from "./EmojiManager";
import { ThreadsPanel } from "./ThreadsPanel";
import { InviteSettings } from "./InviteSettings";
import { MembersPanel, type ServerMember } from "./MembersPanel";
import { useRouter } from "next/navigation";
import type { ServerRole } from "@/lib/types";
import { useServerPresence } from "@/hooks/useServerPresence";
import { createClient } from "@/lib/supabase/client";
import { playJoinSound, playLeaveSound, unlockAudio } from "@/lib/call-sounds";
import { ensureMicAccess, refreshMediaDevices } from "@/lib/media-devices";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

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
  profile?: Profile | null;
  displayName: string;
  avatarUrl?: string | null;
  loadingMessages?: boolean;
  demo?: boolean;
  replyTo?: Message | null;
  typingNames?: string[];
  mutedChannels?: Set<string>;
  serverMuted?: boolean;
  unreadChannels?: Set<string>;
  compact?: boolean;
  searchQuery?: string;
  pinsOnly?: boolean;
  onSend: (payload: SendPayload) => Promise<void> | void;
  onEdit?: (messageId: string, content: string) => Promise<void> | void;
  onDelete?: (messageId: string) => Promise<void> | void;
  onReact?: (messageId: string, emoji: string) => Promise<void> | void;
  onPin?: (messageId: string, pin: boolean) => Promise<void> | void;
  onStartThread?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onCancelReply?: () => void;
  onTyping?: () => void;
  onCreateChannel?: (name: string, kind: "text" | "voice") => Promise<void> | void;
  onMuteChannel?: (channelId: string, mute: boolean) => Promise<void> | void;
  onMuteServer?: (mute: boolean) => Promise<void> | void;
  onToggleCompact?: () => void;
  onSearchChange?: (q: string) => void;
  onTogglePins?: () => void;
  onMarkServerRead?: () => void;
  onUpdateTopic?: (topic: string) => void;
  onKick?: (userId: string) => void;
  onTimeout?: (userId: string, minutes: number) => void;
  onAssignRole?: (userId: string, roleId: string) => void | Promise<void>;
  onRemoveRole?: (userId: string, roleId: string) => void | Promise<void>;
  onMessageUser?: (userId: string) => void;
  onServerUpdated?: (patch: Partial<Server>) => void;
  onSignOut?: () => void;
  onProfileSaved?: (next: Profile) => void;
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
  profile,
  displayName,
  avatarUrl,
  loadingMessages,
  demo,
  replyTo,
  typingNames,
  mutedChannels,
  serverMuted,
  unreadChannels,
  compact,
  searchQuery = "",
  pinsOnly = false,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onStartThread,
  onReply,
  onCancelReply,
  onTyping,
  onCreateChannel,
  onMuteChannel,
  onMuteServer,
  onToggleCompact,
  onSearchChange,
  onTogglePins,
  onMarkServerRead,
  onUpdateTopic,
  onKick,
  onTimeout,
  onAssignRole,
  onRemoveRole,
  onMessageUser,
  onServerUpdated,
  onSignOut,
  onProfileSaved,
}: AppShellProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceSession, setVoiceSession] = useState<VoiceSession | null>(null);
  const [callConnected, setCallConnected] = useState(false);
  const [callKey, setCallKey] = useState(0);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<Record<string, string[]>>(
    {},
  );
  const [liveRoster, setLiveRoster] = useState<
    { user_id: string; display_name: string }[]
  >([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [topicEdit, setTopicEdit] = useState(false);
  const [topicValue, setTopicValue] = useState(channel.topic ?? "");
  const [popoutProfile, setPopoutProfile] = useState<Profile | null>(null);
  const [localProfile, setLocalProfile] = useState<Profile | null>(
    profile ?? null,
  );

  useEffect(() => {
    if (profile) setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    setTopicValue(channel.topic ?? "");
    setTopicEdit(false);
  }, [channel.id, channel.topic]);

  const localName = localProfile?.display_name ?? displayName;
  const localAvatar = localProfile?.avatar_url ?? avatarUrl ?? null;
  const localStatus = localProfile?.status ?? "online";
  const localCustomStatus = localProfile?.custom_status ?? null;

  const inCall = voiceSession != null;
  const isVoice = (channel.kind ?? "text") === "voice";
  const viewingCallUi = Boolean(
    inCall &&
      voiceSession &&
      isVoice &&
      channel.id === voiceSession.channelId,
  );
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
    setSpeakingIds([]);
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
  const handleSpeakingChange = useCallback((ids: string[]) => {
    setSpeakingIds(ids);
  }, []);
  const handleProfileSaved = useCallback(
    (next: Profile) => {
      setLocalProfile((prev) => ({ ...(prev ?? next), ...next }));
      onProfileSaved?.(next);
    },
    [onProfileSaved],
  );

  const openProfile = useCallback(
    async (userIdToOpen: string) => {
      if (demo) return;
      if (localProfile && userIdToOpen === localProfile.id) {
        setPopoutProfile(localProfile);
        return;
      }
      const member = serverMembers.find((m) => m.id === userIdToOpen);
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userIdToOpen)
        .maybeSingle();
      if (data) {
        setPopoutProfile(data as Profile);
      } else if (member) {
        setPopoutProfile({
          id: member.id,
          display_name: member.display_name,
          avatar_url: member.avatar_url,
          status: member.status,
          custom_status: member.custom_status,
          bio: member.bio,
        });
      }
    },
    [demo, localProfile, serverMembers],
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
        .select(
          "user_id, profiles(id, display_name, avatar_url, status, custom_status, bio)",
        )
        .eq("server_id", server.id);

      if (cancelled) return;

      const rows: ServerMember[] = (data ?? [])
        .map((row) => {
          const pRaw = row.profiles as Profile | Profile[] | null;
          const p = Array.isArray(pRaw) ? pRaw[0] : pRaw;
          if (!p) return null;
          return {
            id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            status: p.status,
            custom_status: p.custom_status,
            bio: p.bio,
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

    async function loadRoles() {
      const { data } = await supabase
        .from("server_roles")
        .select("*")
        .eq("server_id", server.id)
        .order("position");
      if (!cancelled) setRoles((data as ServerRole[]) ?? []);
    }

    async function loadMemberRoles() {
      const { data } = await supabase
        .from("member_roles")
        .select("user_id, role_id")
        .eq("server_id", server.id);
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      for (const row of data ?? []) {
        const uid = row.user_id as string;
        const rid = row.role_id as string;
        if (!map[uid]) map[uid] = [];
        map[uid].push(rid);
      }
      setMemberRoleIds(map);
    }

    void loadMembers();
    void loadRoles();
    void loadMemberRoles();
    return () => {
      cancelled = true;
    };
  }, [demo, server.id]);

  const assignRole = useCallback(
    async (targetUserId: string, roleId: string) => {
      setMemberRoleIds((prev) => {
        const cur = prev[targetUserId] ?? [];
        if (cur.includes(roleId)) return prev;
        return { ...prev, [targetUserId]: [...cur, roleId] };
      });
      await onAssignRole?.(targetUserId, roleId);
    },
    [onAssignRole],
  );

  const removeRole = useCallback(
    async (targetUserId: string, roleId: string) => {
      setMemberRoleIds((prev) => {
        const cur = prev[targetUserId] ?? [];
        return {
          ...prev,
          [targetUserId]: cur.filter((id) => id !== roleId),
        };
      });
      await onRemoveRole?.(targetUserId, roleId);
    },
    [onRemoveRole],
  );

  const voiceChannelId =
    inCall && voiceSession ? voiceSession.channelId : null;

  const { online, inVoiceByChannel } = useServerPresence({
    serverId: server.id,
    userId: userId || "anon",
    displayName: localName,
    avatarUrl: localAvatar,
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
        display_name: localName,
        avatar_url: localAvatar ?? byId.get(userId)?.avatar_url ?? null,
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
    <div className="hango-anim-fade flex h-dvh w-full overflow-hidden bg-bg text-text">
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
            unreadChannels={unreadChannels}
            mutedChannels={mutedChannels}
            serverMuted={serverMuted}
            onCreateChannel={
              demo || !onCreateChannel ? undefined : () => setCreateOpen(true)
            }
            onMuteChannel={demo ? undefined : onMuteChannel}
            onMuteServer={demo ? undefined : onMuteServer}
            onCopyInvite={() => toast("Invite copied", "success")}
            onOpenRoles={demo ? undefined : () => setRolesOpen(true)}
            onOpenSearch={demo ? undefined : () => setSearchOpen(true)}
            onOpenEmoji={demo ? undefined : () => setEmojiOpen(true)}
            onOpenThreads={
              demo || isVoice ? undefined : () => setThreadsOpen(true)
            }
            onOpenInvite={
              demo || server.owner_id !== userId
                ? undefined
                : () => setInviteOpen(true)
            }
            onMarkRead={demo ? undefined : onMarkServerRead}
            onEditTopic={
              demo || isVoice ? undefined : () => setTopicEdit(true)
            }
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
            displayName={localName}
            avatarUrl={localAvatar}
            status={localStatus}
            customStatus={localCustomStatus}
            onSignOut={onSignOut}
            onOpenSettings={demo ? undefined : () => setSettingsOpen(true)}
            onToggleCompact={onToggleCompact}
            compact={compact}
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

        {inCall && voiceSession && !demo && (
          <div
            className={
              viewingCallUi ? "flex min-h-0 flex-1 flex-col" : undefined
            }
          >
            <CallErrorBoundary onReset={handleCallReset}>
              <MemoCallSlot
                channelId={voiceSession.channelId}
                callKey={callKey}
                channelName={voiceSession.channelName}
                displayName={localName}
                variant={viewingCallUi ? "full" : "pip"}
                returnHref={
                  demo
                    ? `/app/demo?c=${voiceSession.channelId}`
                    : `/app/${server.id}/${voiceSession.channelId}`
                }
                onConnected={handleCallConnected}
                onDisconnected={handleCallDisconnected}
                onLeave={handleCallLeave}
                onRemoteRoster={handleRemoteRoster}
                onSpeakingChange={handleSpeakingChange}
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
                channelTopic={channel.topic}
                messages={messages}
                loading={loadingMessages}
                currentUserId={userId}
                compact={compact}
                typingNames={typingNames}
                searchQuery={searchQuery}
                pinsOnly={pinsOnly}
                onEdit={onEdit}
                onDelete={onDelete}
                onReply={onReply}
                onReact={onReact}
                onPin={onPin}
                onStartThread={onStartThread}
                onOpenProfile={(id) => void openProfile(id)}
              />
              {onSearchChange && searchQuery !== undefined && (
                <div className="flex items-center gap-2 border-t border-border bg-chat px-4 py-1.5">
                  <input
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search messages in channel…"
                    className="min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="text-[11px] text-text-muted hover:text-text"
                      onClick={() => onSearchChange("")}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <MessageComposer
                channelName={channel.name}
                channelId={channel.id}
                replyTo={replyTo}
                onCancelReply={onCancelReply}
                onSend={onSend}
                onTyping={onTyping}
                onToggleSearch={() =>
                  onSearchChange?.(searchQuery ? "" : " ")
                }
                onTogglePins={onTogglePins}
              />
            </>
          ))}
      </div>

      {!demo && (
        <MembersPanel
          serverMembers={serverMembers}
          speakingIds={speakingIds}
          currentUserId={userId}
          isOwner={server.owner_id === userId}
          roles={roles}
          memberRoleIds={memberRoleIds}
          onOpenProfile={(id) => void openProfile(id)}
          onKick={onKick}
          onTimeout={onTimeout}
          onAssignRole={(id, roleId) => void assignRole(id, roleId)}
          onRemoveRole={(id, roleId) => void removeRole(id, roleId)}
          onMessageUser={onMessageUser}
          online={(() => {
            const byId = new Map(online.map((u) => [u.user_id, u]));
            if (inCall && voiceSession && userId) {
              const self = byId.get(userId);
              byId.set(userId, {
                user_id: userId,
                display_name: self?.display_name || localName,
                avatar_url: self?.avatar_url ?? localAvatar ?? null,
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

      {!demo && topicEdit && onUpdateTopic && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setTopicEdit(false)}
          />
          <form
            className="relative w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-5"
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateTopic(topicValue.trim());
              setTopicEdit(false);
            }}
          >
            <h2 className="text-sm font-semibold">Channel topic</h2>
            <input
              value={topicValue}
              onChange={(e) => setTopicValue(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm outline-none"
              maxLength={120}
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTopicEdit(false)}
                className="text-sm text-text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-fg"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {!demo && (
        <ProfileEditor
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          profile={
            localProfile ?? {
              id: userId,
              display_name: localName,
              avatar_url: localAvatar,
              status: localStatus,
              custom_status: localCustomStatus,
            }
          }
          onSaved={handleProfileSaved}
        />
      )}

      {!demo && onCreateChannel && (
        <CreateChannelModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={onCreateChannel}
        />
      )}

      {!demo && (
        <RolesModal
          open={rolesOpen}
          onClose={() => {
            setRolesOpen(false);
            void createClient()
              .from("server_roles")
              .select("*")
              .eq("server_id", server.id)
              .order("position")
              .then(({ data }) => {
                if (data) setRoles(data as ServerRole[]);
              });
          }}
          serverId={server.id}
          isOwner={server.owner_id === userId}
        />
      )}

      {!demo && (
        <ServerSearch
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          serverId={server.id}
          onJump={(channelId) => {
            router.push(`/app/${server.id}/${channelId}`);
          }}
        />
      )}

      {!demo && (
        <EmojiManager
          open={emojiOpen}
          onClose={() => setEmojiOpen(false)}
          serverId={server.id}
          isOwner={server.owner_id === userId}
          onPick={(em) => {
            void onSend({ content: `:${em.name}:` });
          }}
        />
      )}

      {!demo && threadsOpen && (
        <div className="pointer-events-none fixed inset-0 z-40">
          <div className="pointer-events-auto absolute inset-y-0 right-56 top-0 hidden lg:block">
            <ThreadsPanel
              open={threadsOpen}
              onClose={() => setThreadsOpen(false)}
              channelId={channel.id}
              onOpenRoot={() => setThreadsOpen(false)}
            />
          </div>
        </div>
      )}

      {!demo && (
        <InviteSettings
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          server={server}
          onUpdated={(patch) => onServerUpdated?.(patch)}
        />
      )}

      <UserProfilePopout
        open={Boolean(popoutProfile)}
        profile={popoutProfile}
        onClose={() => setPopoutProfile(null)}
        isOwner={server.owner_id === userId}
        isSelf={popoutProfile?.id === userId}
        roles={roles}
        assignedRoleIds={
          popoutProfile ? (memberRoleIds[popoutProfile.id] ?? []) : []
        }
        onAssignRole={(id, roleId) => void assignRole(id, roleId)}
        onRemoveRole={(id, roleId) => void removeRole(id, roleId)}
        onMessage={onMessageUser}
        onKick={onKick}
        onTimeout={onTimeout}
      />
    </div>
  );
}

const MemoCallSlot = memo(function MemoCallSlot({
  channelId,
  callKey,
  channelName,
  displayName,
  variant,
  returnHref,
  onConnected,
  onDisconnected,
  onLeave,
  onRemoteRoster,
  onSpeakingChange,
}: {
  channelId: string;
  callKey: number;
  channelName: string;
  displayName: string;
  variant: "full" | "pip";
  returnHref: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onLeave: () => void;
  onRemoteRoster: (
    peers: { user_id: string; display_name: string }[],
  ) => void;
  onSpeakingChange: (ids: string[]) => void;
}) {
  return (
    <CallOverlay
      key={`${channelId}-${callKey}`}
      channelId={channelId}
      channelName={channelName}
      displayName={displayName}
      variant={variant}
      returnHref={returnHref}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      onLeave={onLeave}
      onRemoteRoster={onRemoteRoster}
      onSpeakingChange={onSpeakingChange}
    />
  );
});
