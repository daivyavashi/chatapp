import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ room: string }> }) {
  try {
    const { room } = await params;

    const { rows } = await sql`
      SELECT m.id, m.room, m.username, m.text, m.timestamp, m.isSystem, m.reply_to_id,
             u.color, u.avatarUrl,
             rm.username AS reply_username, rm.text AS reply_text
      FROM messages m
      LEFT JOIN users u ON m.username = u.username
      LEFT JOIN messages rm ON m.reply_to_id = rm.id
      WHERE m.room = ${room}
      ORDER BY m.timestamp ASC
    `;

    const formatted = rows.map((r: any) => ({
      id: r.id,
      room: r.room,
      username: r.username,
      text: r.text,
      timestamp: r.timestamp,
      isSystem: r.isSystem === 1,
      color: r.color,
      avatarUrl: r.avatarUrl,
      replyToId: r.reply_to_id || null,
      replyUsername: r.reply_username || null,
      replyText: r.reply_text || null,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Fetch Messages Error:", error);
    return NextResponse.json({ error: "Failed to fetch messages." }, { status: 500 });
  }
}
