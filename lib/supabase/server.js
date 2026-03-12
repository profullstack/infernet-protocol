import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let client;

export function getSupabaseServerClient() {
  if (!client) {
    const env = getEnv();
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: env.supabaseSchema
      }
    });
  }

  return client;
}
