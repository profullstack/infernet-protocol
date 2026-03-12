import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";

const ORIGINAL_ENV = process.env;

describe("getEnv", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("returns normalized env values", () => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      INFERNET_DEFAULT_PAGE_SIZE: "12"
    };

    expect(getEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role",
      supabaseSchema: "public",
      pageSize: 12
    });
  });

  it("throws when required env is missing", () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getEnv()).toThrow(/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
  });
});
