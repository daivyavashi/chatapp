import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * Serverless Upload API (Unified for avatars and attachments).
 * Replaces Multer and Express's /api/upload-avatar and /api/upload-attachment.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("avatar") || formData.get("file");
    const username = formData.get("username") as string;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Determine path based on usage
    const isAvatar = formData.has("avatar");
    const folder = isAvatar ? "avatars" : "attachments";
    
    // Upload to Vercel Blob
    const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, {
      access: "public",
    });

    if (isAvatar && username) {
      // Update DB for avatar
      await sql`UPDATE users SET avatarUrl = ${blob.url} WHERE username = ${username}`;
      return NextResponse.json({ avatarUrl: blob.url });
    } else {
      // Return attachment details
      const isImage = file.type.startsWith('image/');
      return NextResponse.json({ url: blob.url, name: file.name, isImage });
    }

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}
