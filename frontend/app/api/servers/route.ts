import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/**
 * Server Management API.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username required." }, { status: 400 });
    }

    // Fetch servers for user
    const { rows: servers } = await sql`
      SELECT s.* FROM servers s
      JOIN server_members sm ON s.id = sm.server_id
      WHERE sm.username = ${username}
    `;

    if (servers.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch channels for these servers
    const serverIds = servers.map(s => s.id);
    const { rows: channels } = await sql`
      SELECT * FROM channels WHERE server_id = ANY(${serverIds as any})
    `;

    const formattedServers = servers.map(srv => ({
      id: srv.id,
      name: srv.name,
      abbr: srv.abbr,
      iconUrl: srv.icon_url,
      channels: channels.filter(ch => ch.server_id === srv.id).map(ch => ({ id: ch.id, name: ch.name }))
    }));

    return NextResponse.json(formattedServers);
  } catch (error) {
    console.error("Fetch Servers Error:", error);
    return NextResponse.json({ error: "Failed to fetch servers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, abbr, username } = await req.json();

    if (!name || !abbr || !username) {
      return NextResponse.json({ error: "Name, abbreviation, and username required." }, { status: 400 });
    }

    const srvId = "s-" + Date.now();
    const chId = "c-" + Date.now();

    // Create server
    await sql`INSERT INTO servers (id, name, abbr) VALUES (${srvId}, ${name}, ${abbr})`;
    
    // Create default channel
    await sql`INSERT INTO channels (id, server_id, name) VALUES (${chId}, ${srvId}, 'general')`;
    
    // Add member
    await sql`INSERT INTO server_members (server_id, username) VALUES (${srvId}, ${username})`;

    return NextResponse.json({
      id: srvId,
      name,
      abbr,
      channels: [{ id: chId, name: 'general' }]
    }, { status: 201 });

  } catch (error) {
    console.error("Create Server Error:", error);
    return NextResponse.json({ error: "Failed to create server." }, { status: 500 });
  }
}
