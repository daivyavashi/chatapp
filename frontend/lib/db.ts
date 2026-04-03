import { sql } from "@vercel/postgres";

/**
 * Shared database utility for Vercel Postgres.
 * This provides a clean interface to query the database using standard SQL.
 */
export async function query(queryString: string, values: any[] = []) {
  try {
    // Vercel Postgres uses a tagged template literal for simple queries, 
    // but for parameterized dynamic queries, we use sql.query
    const result = await sql.query(queryString, values);
    return result;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}
