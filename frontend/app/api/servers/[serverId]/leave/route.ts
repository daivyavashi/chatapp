import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ serverId: string }> }) {
  try {
    const { serverId } = await params;
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Username required." }, { status: 400 });
    }

    await sql`
      DELETE FROM server_members 
      WHERE server_id = ${serverId} AND username = ${username}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave Server Error:", error);
    return NextResponse.json({ error: "Failed to leave server." }, { status: 500 });
  }
}
