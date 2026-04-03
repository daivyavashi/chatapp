import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  try {
    const { serverId } = params;
    const { name } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Channel name required." }, { status: 400 });
    }

    const formattedName = name.toLowerCase().replace(/\s+/g, '-');
    const chId = "c-" + Date.now();

    await sql`
      INSERT INTO channels (id, server_id, name) 
      VALUES (${chId}, ${serverId}, ${formattedName})
    `;

    return NextResponse.json({ id: chId, name: formattedName }, { status: 201 });
  } catch (error) {
    console.error("Create Channel Error:", error);
    return NextResponse.json({ error: "Failed to create channel." }, { status: 500 });
  }
}
