"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Channel, Message, Server } from "@/lib/types";
import { ChannelList } from "./ChannelList";
import { MessagePane } from "./MessagePane";
import { MessageComposer } from "./MessageComposer";
import { UserBar } from "./UserBar";
import { CallOverlay } from "./CallOverlay";
import { cn } from "@/lib/utils";

type AppShellProps = {
  server: Server;
  channels: Channel[];
  channel: Channel;
  messages: Message[];
  displayName: string;
  avatarUrl?: string | null;
  loadingMessages?: boolean;
  demo?: boolean;
  onSend: (content: string) => Promise<void> | void;
  onSignOut?: () => void;
};

export function AppShell({
  server,
  channels,
  channel,
  messages,
  displayName,
  avatarUrl,
  loadingMessages,
  demo,
  onSend,
  onSignOut,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inCall, setInCall] = useState(true);

  const isVoice = (channel.kind ?? "text") === "voice";
  const homeHref = demo ? "/app/demo" : "/app";

  const hrefForChannel = demo
    ? (c: Channel) => `/app/demo?c=${c.id}`
    : (c: Channel) => `/app/${server.id}/${c.id}`;

  useEffect(() => {
    if (isVoice) setInCall(true);
  }, [channel.id, isVoice]);

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
                Voice preview — sign in with LiveKit configured to join real
                calls.
              </p>
              <Link
                href={homeHref}
                className="text-xs text-text-muted hover:text-text"
              >
                Back to home
              </Link>
            </div>
          ) : inCall ? (
            <CallOverlay
              key={channel.id}
              channelId={channel.id}
              channelName={channel.name}
              displayName={displayName}
              preferVideo={false}
              fullStage
              onLeave={() => setInCall(false)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#050505]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-text-muted ring-1 ring-white/10">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-text">
                  {channel.name}
                </h2>
                <p className="mt-1 text-sm text-text-muted">You left the call</p>
              </div>
              <button
                type="button"
                onClick={() => setInCall(true)}
                className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-medium text-black hover:bg-emerald-400"
              >
                Rejoin voice
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
    </div>
  );
}
