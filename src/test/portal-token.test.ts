import { describe, expect, it } from "vitest";

import { isPortalTokenValid } from "@/lib/portal-token";

describe("portal token validation", () => {
  it("accepts token-safe strings within the supported length", () => {
    expect(isPortalTokenValid("aB_0123456789-abcdefghij")).toBe(true);
  });

  it("rejects malformed or out-of-range tokens", () => {
    expect(isPortalTokenValid("short-token")).toBe(false);
    expect(isPortalTokenValid("a".repeat(101))).toBe(false);
    expect(isPortalTokenValid("a".repeat(20) + "/")).toBe(false);
  });
});
