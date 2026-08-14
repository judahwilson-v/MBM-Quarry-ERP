"use server";

import fs from "fs";
import path from "path";
import { Client } from "pg";

export async function initializeSupabaseSchema() {
  const directUrl = process.env.SUPABASE_DIRECT_URL || process.env.DATABASE_URL;
  
  if (!directUrl || !directUrl.startsWith("postgres")) {
    return { success: false, error: "Postgres connection string (SUPABASE_DIRECT_URL) not found." };
  }

  try {
    const schemaPath = path.join(process.cwd(), "docs", "database", "supabase_schema.sql");
    const rlsPath = path.join(process.cwd(), "docs", "database", "supabase_rls_policies.sql");
    
    if (!fs.existsSync(schemaPath) || !fs.existsSync(rlsPath)) {
      return { success: false, error: "SQL definition files missing from docs/database." };
    }

    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    const rlsSql = fs.readFileSync(rlsPath, "utf-8");

    const client = new Client({ connectionString: directUrl });
    await client.connect();

    try {
      await client.query(schemaSql);
      await client.query(rlsSql);
      return { success: true, message: "Cloud schema and RLS policies initialized successfully." };
    } finally {
      await client.end();
    }
  } catch (error: any) {
    console.error("Schema init error:", error);
    return { success: false, error: error.message };
  }
}
