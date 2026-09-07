"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import type { Channel, Message, Server } from "@/lib/types";
import { ChannelList } from "./ChannelList";
import { MessagePane } from "./MessagePane";
import { MessageComposer } from "./MessageComposer";
import { UserBar } from "./UserBar";
import { MembersPanel } from "./MembersPanel";
import { useServerPresence } from "@/hooks/useServerPresence";
import { cn } from "@/lib/utils";

const CallOverlay = dynamic(
  () =>
    import("./CallOverlay").then((m) => m.CallOverlay),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-[#050505] text-sm text-text-muted">
        Preparing call…
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#050505] px-6 text-center">
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
      );
    }
    return this.props.children;
  }
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
  const [inCall, setInCall] = useState(false);
  const [callKey, setCallKey] = useState(0);

  const isVoice = (channel.kind ?? "text") === "voice";
  const homeHref = demo ? "/app/demo" : "/app";

  const hrefForChannel = demo
    ? (c: Channel) => `/app/demo?c=${c.id}`
    : (c: Channel) => `/app/${server.id}/${c.id}`;

  // Auto-join when entering a voice channel (after a tick so UI can paint first)
  useEffect(() => {
    if (!isVoice || demo) {
      setInCall(false);
      return;
    }
    const t = window.setTimeout(() => setInCall(true), 50);
    return () => window.clearTimeout(t);
  }, [channel.id, isVoice, demo]);

  const voiceChannelId = isVoice && inCall ? channel.id : null;

  const { online, inVoiceByChannel } = useServerPresence({
    serverId: server.id,
    userId: userId || "anon",
    displayName,
    avatarUrl,
    voiceChannelId,
    enabled: !demo && Boolean(userId),
  });

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
            onCloseMobile={() => setSidebarOpen(false)}
            hrefForChannel={hrefForChannel}
            homeHref={homeHref}
            voiceOccupants={inVoiceByChannel}
          />
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

        {isVoice ? (
          demo ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#050505] px-6 text-center">
              <p className="text-sm text-text-secondary">
                Voice preview — sign in to join real calls.
              </p>
            </div>
          ) : inCall ? (
            <CallErrorBoundary
              onReset={() => {
                setInCall(false);
                setCallKey((k) => k + 1);
                window.setTimeout(() => setInCall(true), 100);
              }}
            >
              <CallOverlay
                key={`${channel.id}-${callKey}`}
                channelId={channel.id}
                channelName={channel.name}
                displayName={displayName}
                preferVideo={false}
                fullStage
                onLeave={() => setInCall(false)}
              />
            </CallErrorBoundary>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#050505]">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-text">
                  {channel.name}
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  {(inVoiceByChannel[channel.id]?.length ?? 0) > 0
                    ? `${inVoiceByChannel[channel.id].length} in call`
                    : "No one here yet"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInCall(true)}
                className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-medium text-black hover:bg-emerald-400"
              >
                Join voice
              </button>
            </div>
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
        )}
      </div>

      {!demo && <MembersPanel members={online} />}
    </div>
  );
}
