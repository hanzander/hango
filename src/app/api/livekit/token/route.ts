import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to .env.local",
      },
      { status: 503 },
    );
  }

  let body: { channelId?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id, server_id, name")
    .eq("id", channelId)
    .single();

  if (channelError || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("server_members")
    .select("user_id")
    .eq("server_id", channel.server_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a server member" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single();

  const identity = user.id;
  const name =
    body.displayName?.trim() ||
    profile?.display_name ||
    profile?.username ||
    user.email?.split("@")[0] ||
    "User";

  const roomName = `hango-channel-${channelId}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: "2h",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();

  // Client expects a WebSocket URL (wss://…)
  const wsUrl = url.startsWith("ws")
    ? url
    : url.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

  return NextResponse.json({
    token,
    url: wsUrl,
    roomName,
    channelName: channel.name,
  });
}
