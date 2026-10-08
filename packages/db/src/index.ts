import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type DbConfig = { url: string; anonKey: string; serviceRoleKey?: string };

/**
 * A client that acts as the signed-in person, so row-level security decides
 * what they can read and write. Use this for every request made on a user's behalf.
 */
export function userClient(config: DbConfig, accessToken: string): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A client that bypasses row-level security. Only the worker and the
 * integration callbacks use it, never code that serves a user request.
 */
export function serviceClient(config: DbConfig): SupabaseClient {
  if (!config.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function dbConfigFromEnv(env: Record<string, string | undefined> = process.env): DbConfig {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return { url, anonKey, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
}

export type { SupabaseClient };
