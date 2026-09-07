import { redirect } from "next/navigation";
import { FriendsHome } from "@/components/app/FriendsHome";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function FriendsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
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
    <FriendsHome
      userId={user.id}
      displayName={profile?.display_name || user.email || "User"}
    />
  );
}
