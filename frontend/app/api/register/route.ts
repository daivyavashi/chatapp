import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

/**
 * Serverless Registration API Route.
 * Replaces Express's /api/register from server.js.
 */
export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const defaultAvatar = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${username + Date.now()}`;

    // Insert user into Vercel Postgres
    try {
      const result = await sql`
        INSERT INTO users (username, password, avatarUrl) 
        VALUES (${username}, ${hashedPassword}, ${defaultAvatar}) 
        RETURNING id, username, color, avatarUrl
      `;
      
      const user = result.rows[0];
      return NextResponse.json({
        id: user.id,
        username: user.username,
        color: user.color,
        avatarUrl: user.avatarUrl
      }, { status: 201 });

    } catch (err: any) {
      if (err.message.includes("unique constraint") || err.code === '23505') {
        return NextResponse.json({ error: "Username already exists." }, { status: 409 });
      }
      throw err;
    }

  } catch (error) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Failed to register user." }, { status: 500 });
  }
}
