import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required." }, { status: 400 });
    }

    const { rows } = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      color: user.color,
      avatarUrl: user.avatarUrl
    });

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
