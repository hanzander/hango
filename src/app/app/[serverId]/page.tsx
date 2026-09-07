import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type PageProps = {
  params: Promise<{ serverId: string }>;
};

export default async function ServerPage({ params }: PageProps) {
  const { serverId } = await params;

  if (!isSupabaseConfigured()) {
    redirect("/app/demo");
  }

  const supabase = await createClient();

  const { data: textChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("server_id", serverId)
    .eq("kind", "text")
    .order("position")
    .limit(1)
    .maybeSingle();

  if (textChannel) {
    redirect(`/app/${serverId}/${textChannel.id}`);
  }

  const { data: anyChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("server_id", serverId)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (anyChannel) {
    redirect(`/app/${serverId}/${anyChannel.id}`);
  }

  redirect("/app");
}
