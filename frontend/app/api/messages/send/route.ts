import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher-server";

/**
 * Serverless Message Sending API.
 * Replaces Socket.io 'send_message' event.
 */
export async function POST(req: Request) {
  try {
    const { room, message, replyToId, username, avatarUrl, color } = await req.json();

    if (!room || !message || !username) {
      return NextResponse.json({ error: "Room, message, and username required." }, { status: 400 });
    }

    const ts = new Date().toISOString();

    // Save to Postgres
    const result = await sql`
      INSERT INTO messages (room, username, text, timestamp, isSystem, reply_to_id)
      VALUES (${room}, ${username}, ${message}, ${ts}, 0, ${replyToId || null})
      RETURNING id
    `;
    const newId = result.rows[0].id;

    // Build the payload for Pusher
    let payload: any = {
      id: newId,
      room,
      username,
      text: message,
      timestamp: ts,
      isSystem: false,
      color,
      avatarUrl,
      replyToId: replyToId || null,
    };

    // Handle reply specifics
    if (replyToId) {
      const { rows: parents } = await sql`SELECT username, text FROM messages WHERE id = ${replyToId}`;
      if (parents.length > 0) {
        payload.replyUsername = parents[0].username;
        payload.replyText = parents[0].text;
      }
    }

    // Trigger Pusher notification
    await pusherServer.trigger(`presence-room-${room}`, "receive_message", payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Store Message Error:", error);
    return NextResponse.json({ error: "Failed to store message." }, { status: 500 });
  }
}

/**
 * Serverless Message Deletion API.
 * Replaces Socket.io 'delete_message' event.
 */
export async function DELETE(req: Request) {
  try {
    const { messageId, room, username } = await req.json();

    if (!messageId || !room || !username) {
      return NextResponse.json({ error: "MessageId, room, and username required." }, { status: 400 });
    }

    // Verify ownership
    const { rows } = await sql`SELECT username FROM messages WHERE id = ${messageId}`;
    if (rows.length === 0 || rows[0].username !== username) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await sql`DELETE FROM messages WHERE id = ${messageId}`;

    // Notify Pusher
    await pusherServer.trigger(`presence-room-${room}`, "message_deleted", { id: messageId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Message Error:", error);
    return NextResponse.json({ error: "Failed to delete message." }, { status: 500 });
  }
}
