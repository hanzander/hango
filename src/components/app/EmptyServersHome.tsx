"use client";

import { ServerActionsModal } from "@/components/app/ServerActionsModal";
import { HangoMark } from "@/components/brand/HangoLogo";
import { enterServerNow } from "@/lib/leave-server";
import { useState } from "react";

export function EmptyServersHome({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <HangoMark size={56} className="mb-4 rounded-2xl" />
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        Welcome{displayName ? `, ${displayName}` : ""}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        You&apos;re not in any servers yet. Create one for your crew, or join
        with an invite code.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg"
        >
          Create or join a server
        </button>
      </div>
      <ServerActionsModal
        open={open}
        onClose={() => setOpen(false)}
        onJoined={(serverId) => {
          enterServerNow(serverId);
        }}
      />
    </div>
  );
}
