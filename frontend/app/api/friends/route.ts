import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/**
 * Friends Management API.
 */
export async function POST(req: Request) {
  try {
    const { username, friendUsername } = await req.json();

    if (!username || !friendUsername) {
      return NextResponse.json({ error: "Required fields missing." }, { status: 400 });
    }

    const { rows } = await sql`SELECT * FROM users WHERE username = ${friendUsername}`;
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const [u1, u2] = [username, friendUsername].sort();

    await sql`
      INSERT INTO friends (user1, user2) 
      VALUES (${u1}, ${u2}) 
      ON CONFLICT DO NOTHING
    `;

    return NextResponse.json({ 
      success: true, 
      friend: { username: user.username, color: user.color, avatarUrl: user.avatarUrl } 
    });
  } catch (error) {
    console.error("Add Friend Error:", error);
    return NextResponse.json({ error: "Failed to add friend." }, { status: 500 });
  }
}
