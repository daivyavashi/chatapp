import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  try {
    const { serverId } = params;
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Username required." }, { status: 400 });
    }

    // Check if user exists
    const { rows: users } = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = users[0];

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Add user to server
    await sql`
      INSERT INTO server_members (server_id, username) 
      VALUES (${serverId}, ${username}) 
      ON CONFLICT DO NOTHING
    `;

    // System welcome message
    const { rows: channels } = await sql`SELECT id FROM channels WHERE server_id = ${serverId} AND name = 'general'`;
    const genChannel = channels[0];

    if (genChannel) {
      const room = `${serverId}-${genChannel.id}`;
      const text = `${username} hopped into the server!`;
      const ts = new Date().toISOString();

      const { rows: msgs } = await sql`
        INSERT INTO messages (room, username, text, timestamp, isSystem) 
        VALUES (${room}, 'System', ${text}, ${ts}, 1) 
        RETURNING id
      `;
      
      const newMsg = msgs[0];

      // Trigger Pusher notification
      await pusherServer.trigger(`presence-room-${room}`, "receive_message", {
        id: newMsg.id,
        room: room,
        username: "System",
        text,
        timestamp: ts,
        isSystem: true,
      });
    }

    return NextResponse.json({ 
      success: true, 
      username: user.username, 
      color: user.color, 
      avatarUrl: user.avatarUrl 
    });

  } catch (error) {
    console.error("Invite Server Error:", error);
    return NextResponse.json({ error: "Failed to invite user." }, { status: 500 });
  }
}
