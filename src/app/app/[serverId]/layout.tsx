"use client";

import { useParams, usePathname } from "next/navigation";
import { ChatWorkspace } from "@/components/app/ChatWorkspace";

/**
 * Keeps ChatWorkspace mounted while switching channels in this server,
 * so a LiveKit call survives navigating to #general and back (Discord-style).
 */
export default function ServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ serverId: string }>();
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  // /app/:serverId/:channelId
  const channelId = parts.length >= 3 ? parts[2] : undefined;

  return (
    <>
      <ChatWorkspace serverId={params.serverId} channelId={channelId} />
      {/* Nested pages still render for routing; workspace lives in the layout */}
      <div className="hidden" aria-hidden>
        {children}
      </div>
    </>
  );
}
