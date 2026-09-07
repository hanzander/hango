import { redirect } from "next/navigation";
import { DmWorkspace } from "@/components/app/DmWorkspace";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function DmPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const { channelId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  return (
    <DmWorkspace
      channelId={channelId}
      userId={user.id}
      displayName={profile?.display_name || "User"}
    />
  );
}
