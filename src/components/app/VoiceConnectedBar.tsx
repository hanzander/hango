"use client";

import Link from "next/link";

type VoiceConnectedBarProps = {
  channelName: string;
  channelHref: string;
  connected: boolean;
  onDisconnect: () => void;
};

/** Discord-style strip above the user bar while you’re in a voice channel. */
export function VoiceConnectedBar({
  channelName,
  channelHref,
  connected,
  onDisconnect,
}: VoiceConnectedBarProps) {
  return (
    <div className="border-t border-emerald-500/20 bg-emerald-500/10 px-2 py-2">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        {connected ? "Voice connected" : "Reconnecting…"}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        <Link
          href={channelHref}
          className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/10"
          title={`Return to ${channelName}`}
        >
          {channelName}
        </Link>
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
