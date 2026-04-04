import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher-server";

/**
 * Pusher Presence/Private Channel Authentication.
 * This is necessary for real-time presence features (who is online in a room).
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username") || "Anonymous";

    const data = await req.text();
    const params = new URLSearchParams(data);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");

    if (!socketId || !channelName) {
      return new Response("Unauthorized", { status: 401 });
    }

    const presenceData = {
      user_id: username,
      user_info: { username },
    };

    const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData);
    return NextResponse.json(authResponse);

  } catch (error) {
    console.error("Pusher Auth Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
