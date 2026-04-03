import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * Server Settings API (Unified for updates).
 */
export async function POST(req: Request, { params }: { params: { serverId: string } }) {
  try {
    const { serverId } = params;
    const formData = await req.formData();
    const name = formData.get("name") as string;
    const iconFile = formData.get("icon") as File | null;

    if (!name) {
      return NextResponse.json({ error: "Server name required." }, { status: 400 });
    }

    let iconUrl = null;
    if (iconFile) {
      const blob = await put(`server-icons/${serverId}-${Date.now()}-${iconFile.name}`, iconFile, {
        access: "public",
      });
      iconUrl = blob.url;
    }

    if (iconUrl) {
      await sql`
        UPDATE servers SET name = ${name}, icon_url = ${iconUrl} 
        WHERE id = ${serverId}
      `;
      return NextResponse.json({ success: true, name, iconUrl });
    } else {
      await sql`
        UPDATE servers SET name = ${name} 
        WHERE id = ${serverId}
      `;
      return NextResponse.json({ success: true, name });
    }

  } catch (error) {
    console.error("Update Server Error:", error);
    return NextResponse.json({ error: "Failed to update server." }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: { serverId: string } }) {
  try {
    const { serverId } = params;
    const { rows } = await sql`
      SELECT sm.username, u.color, u.avatarUrl
      FROM server_members sm
      JOIN users u ON sm.username = u.username
      WHERE sm.server_id = ${serverId}
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Fetch Members Error:", error);
    return NextResponse.json({ error: "Failed to fetch members." }, { status: 500 });
  }
}
