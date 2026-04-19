const requiredKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

export function getEnv() {
  const env = {
    supabaseUrl: process.env.SUPABASE_URL || "http://127.0.0.1:54321",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseSchema: process.env.SUPABASE_SCHEMA || "public",
    pageSize: Number(process.env.INFERNET_DEFAULT_PAGE_SIZE || 25)
  };

  const missing = requiredKeys.filter((key) => key !== "SUPABASE_URL" && !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return env;
}
