import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

/**
 * Pusher Presence/Private Channel Authentication.
 * This is necessary for real-time presence features (who is online in a room).
 */
export async function POST(req: Request) {
  try {
    const data = await req.text();
    const params = new URLSearchParams(data);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");
    
    // In a real app, you would verify the user session here.
    // For this demo, we'll extract the username if provided in the query or body.
    const username = params.get("username") || "Anonymous";

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
