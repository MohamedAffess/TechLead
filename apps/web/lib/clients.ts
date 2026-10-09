"use client";
import { createClient } from "@supabase/supabase-js";
import { createApiClient } from "@techlead/api-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const configured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = configured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787", async () => {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
});
