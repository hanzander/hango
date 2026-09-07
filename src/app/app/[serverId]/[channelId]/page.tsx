type PageProps = {
  params: Promise<{ serverId: string; channelId: string }>;
};

/** Channel UI is rendered by the parent server layout (sticky across navigations). */
export default async function ChannelPage(_props: PageProps) {
  return null;
}
