import postgres, { type Sql } from "postgres";

declare global {
  var __lennyHubPostgres: Sql | undefined;
}

export function hasPostgresDatabase() {
  return Boolean(process.env.SUPABASE_DATABASE_URL);
}

export function getPostgres() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    throw new Error("未配置 SUPABASE_DATABASE_URL。");
  }
  if (!globalThis.__lennyHubPostgres) {
    globalThis.__lennyHubPostgres = postgres(connectionString, {
      max: 5,
      prepare: false,
      ssl: "require",
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return globalThis.__lennyHubPostgres;
}
