import { db } from "@vercel/postgres";
import { NextResponse } from "next/server";

/**
 * One-time setup route to initialize the Vercel Postgres schema.
 */
export async function GET() {
  let client;
  try {
    client = await db.connect();
    // 1. Users Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        color TEXT DEFAULT '#06b6d4',
        avatarUrl TEXT DEFAULT ''
      );
    `;

    // 2. Servers Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        abbr TEXT NOT NULL,
        icon_url TEXT
      );
    `;

    // 3. Channels Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        server_id TEXT REFERENCES servers(id),
        name TEXT NOT NULL
      );
    `;

    // 4. Server Members Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT REFERENCES servers(id),
        username TEXT,
        PRIMARY KEY (server_id, username)
      );
    `;

    // 5. Friends Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS friends (
        user1 TEXT,
        user2 TEXT,
        PRIMARY KEY (user1, user2)
      );
    `;

    // 6. Messages Table
    await client.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room TEXT NOT NULL,
        username TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        isSystem INTEGER DEFAULT 0,
        reply_to_id INTEGER DEFAULT NULL
      );
    `;

    return NextResponse.json({ message: "Database tables initialized successfully." });
  } catch (error) {
    console.error("Setup Error:", error);
    return NextResponse.json({ error: "Failed to initialize tables." }, { status: 500 });
  } finally {
    client?.release();
  }
}
