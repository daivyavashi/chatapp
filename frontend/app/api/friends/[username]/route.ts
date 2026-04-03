import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { username: string } }) {
  try {
    const { username } = params;

    const { rows } = await sql`
      SELECT u.username, u.color, u.avatarUrl
      FROM friends f
      JOIN users u ON (u.username = f.user1 OR u.username = f.user2)
      WHERE (f.user1 = ${username} OR f.user2 = ${username}) AND u.username != ${username}
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Fetch Friends Error:", error);
    return NextResponse.json({ error: "Failed to fetch friends." }, { status: 500 });
  }
}
