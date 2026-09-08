"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type VoiceConnectedBarProps = {
  channelName: string;
  channelHref: string;
  connected: boolean;
  micOn?: boolean;
  deafened?: boolean;
  screenOn?: boolean;
  onToggleMic?: () => void;
  onToggleDeafen?: () => void;
  onToggleScreen?: () => void;
  onDisconnect: () => void;
};

/** Discord-style strip above the user bar while you’re in a voice channel. */
export function VoiceConnectedBar({
  channelName,
  channelHref,
  connected,
  micOn = true,
  deafened = false,
  screenOn = false,
  onToggleMic,
  onToggleDeafen,
  onToggleScreen,
  onDisconnect,
}: VoiceConnectedBarProps) {
  return (
    <div className="border-t border-emerald-500/20 bg-emerald-500/10 px-2 py-2">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        {connected ? "Voice connected" : "Reconnecting…"}
      </p>
      <div className="mt-0.5 flex items-center gap-0.5">
        <Link
          href={channelHref}
          className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/10"
          title={`Return to ${channelName}`}
        >
          {channelName}
          {screenOn ? " · Live" : ""}
        </Link>
        {onToggleMic && (
          <ChromeBtn
            title={micOn && !deafened ? "Mute" : "Unmute"}
            active={!micOn || deafened}
            onClick={onToggleMic}
          >
            {!micOn || deafened ? "M" : "Mic"}
          </ChromeBtn>
        )}
        {onToggleDeafen && (
          <ChromeBtn
            title={deafened ? "Undeafen" : "Deafen"}
            active={deafened}
            onClick={onToggleDeafen}
          >
            {deafened ? "Deaf" : "Head"}
          </ChromeBtn>
        )}
        {onToggleScreen && (
          <ChromeBtn
            title={screenOn ? "Stop sharing" : "Share screen"}
            active={screenOn}
            onClick={onToggleScreen}
          >
            Scr
          </ChromeBtn>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
          title="Disconnect"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

function ChromeBtn({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
        active
          ? "bg-red-500/20 text-red-200"
          : "text-emerald-100/80 hover:bg-emerald-500/15 hover:text-emerald-50",
      )}
    >
      {children}
    </button>
  );
}
