import { ChatWorkspace } from "@/components/app/ChatWorkspace";

type PageProps = {
  params: Promise<{ serverId: string; channelId: string }>;
};

export default async function ChannelPage({ params }: PageProps) {
  const { serverId, channelId } = await params;
  return <ChatWorkspace serverId={serverId} channelId={channelId} />;
}
