import { redirect } from "next/navigation";
import { AppHome } from "@/components/app/AppHome";
import { isSupabaseConfigured } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Server } from "@/lib/types";

export default async function AppIndexPage() {
  if (!isSupabaseConfigured()) {
    redirect("/app/demo");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, onboarding_complete")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_complete) redirect("/onboarding");

  const { data: memberRows } = await supabase
    .from("server_members")
    .select("server_id");

  const serverIds = (memberRows ?? []).map((m) => m.server_id);
  let servers: Server[] = [];

  if (serverIds.length) {
    const { data } = await supabase
      .from("servers")
      .select("*")
      .in("id", serverIds)
      .order("name");
    servers = (data as Server[]) ?? [];
  }

  return (
    <AppHome
      displayName={profile.display_name ?? "User"}
      avatarUrl={profile.avatar_url}
      userId={user.id}
      servers={servers}
    />
  );
}
