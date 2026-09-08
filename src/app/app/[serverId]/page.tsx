"use client";

import { use, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getLastChannelId, setLastChannelId } from "@/lib/app-cache";
import { isSupabaseConfigured } from "@/lib/utils";

type PageProps = {
  params: Promise<{ serverId: string }>;
};

/**
 * Instant server entry: jump to last channel from localStorage (no RSC round-trip).
 * Falls back to a quick client channel lookup only when nothing is cached.
 */
export default function ServerEntryPage({ params }: PageProps) {
  const { serverId } = use(params);
  const router = useRouter();
  const [hint, setHint] = useState("Opening…");

  useLayoutEffect(() => {
    if (!isSupabaseConfigured()) {
      router.replace("/app/demo");
      return;
    }

    const cached = getLastChannelId(serverId);
    if (cached) {
      router.replace(`/app/${serverId}/${cached}`);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: textChannel } = await supabase
          .from("channels")
          .select("id")
          .eq("server_id", serverId)
          .eq("kind", "text")
          .order("position")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (textChannel?.id) {
          setLastChannelId(serverId, textChannel.id);
          router.replace(`/app/${serverId}/${textChannel.id}`);
          return;
        }

        const { data: anyChannel } = await supabase
          .from("channels")
          .select("id")
          .eq("server_id", serverId)
          .order("position")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (anyChannel?.id) {
          setLastChannelId(serverId, anyChannel.id);
          router.replace(`/app/${serverId}/${anyChannel.id}`);
          return;
        }

        setHint("No channels found");
        router.replace("/app");
      } catch {
        if (!cancelled) router.replace("/app");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serverId, router]);

  return (
    <div className="flex h-dvh items-center justify-center bg-bg text-sm text-text-muted">
      {hint}
    </div>
  );
}
