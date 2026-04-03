import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { username, color } = await req.json();

    if (!username || !color) {
      return NextResponse.json({ error: "Missing data." }, { status: 400 });
    }

    await sql`UPDATE users SET color = ${color} WHERE username = ${username}`;

    return NextResponse.json({ success: true, color });
  } catch (error) {
    console.error("Update Color Error:", error);
    return NextResponse.json({ error: "Failed to update color." }, { status: 500 });
  }
}
