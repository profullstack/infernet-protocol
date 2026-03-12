import { describe, expect, it } from "vitest";
import { handleRoute } from "@/lib/http";

describe("handleRoute", () => {
  it("returns the handler response", async () => {
    const response = await handleRoute(async () => new Response("ok", { status: 201 }));
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("ok");
  });

  it("converts thrown errors into json", async () => {
    const response = await handleRoute(async () => {
      throw new Error("broken");
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "broken" });
  });
});
