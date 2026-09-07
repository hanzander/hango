"use client";

import { useRouter } from "next/navigation";
import type { Server } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ServersHome } from "@/components/app/ServersHome";

export function AppHome({
  displayName,
  avatarUrl,
  userId,
  servers,
}: {
  displayName: string;
  avatarUrl?: string | null;
  userId: string;
  servers: Server[];
}) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <ServersHome
      displayName={displayName}
      avatarUrl={avatarUrl}
      userId={userId}
      servers={servers}
      onSignOut={signOut}
    />
  );
}
