import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { toE164 } from "@/lib/phone";
import {
  milestoneTemplateFor,
  renderPreview,
  sanitizeVar,
  shouldSendLiveWhatsApp,
} from "@/lib/whatsapp-templates";
import { etaState, formatDuration } from "@/lib/time";
import { parseAppError } from "@/lib/errors";

describe("role permissions", () => {
  it("technicians cannot check in vehicles", () =>
    expect(can("technician", "ro.create")).toBe(false));
  it("only owners and MSO admins can reopen completed orders", () => {
    expect(can("advisor", "ro.reopen")).toBe(false);
    expect(can("owner", "ro.reopen")).toBe(true);
    expect(can("mso_admin", "ro.reopen")).toBe(true);
  });
  it("parts specialists can move orders but not send messages", () => {
    expect(can("parts_specialist", "ro.transition")).toBe(true);
    expect(can("parts_specialist", "messages.send")).toBe(false);
  });
  it("only owners manage staff", () => {
    expect(can("advisor", "staff.manage")).toBe(false);
    expect(can("owner", "staff.manage")).toBe(true);
  });
});

describe("phone numbers", () => {
  it("normalizes US numbers to E.164", () => expect(toE164("(415) 555-2671")).toBe("+14155552671"));
  it("rejects garbage", () => expect(toE164("12")).toBeNull());
});

describe("WhatsApp templates", () => {
  it("keeps WhatsApp simulated unless live mode is explicitly enabled", () => {
    expect(shouldSendLiveWhatsApp(undefined)).toBe(false);
    expect(shouldSendLiveWhatsApp("mock")).toBe(false);
    expect(shouldSendLiveWhatsApp("live")).toBe(true);
  });
  it("check-in and ready statuses send milestone messages", () => {
    expect(milestoneTemplateFor("CHECKED_IN", false)).toBe("checked_in");
    expect(milestoneTemplateFor("COMPLETED_READY", true)).toBe("vehicle_ready");
    expect(milestoneTemplateFor("IN_LABOR", false)).toBeNull();
    expect(milestoneTemplateFor("CANCELLED", true)).toBeNull();
  });
  it("strips newlines and repeated spaces from variables", () =>
    expect(sanitizeVar(" a\n\tb   c ")).toBe("a b c"));
  it("renders the vehicle-ready text", () =>
    expect(
      renderPreview("vehicle_ready", {
        customer_name: "Ana",
        vehicle: "2021 Toyota Camry",
        shop_name: "Joe's",
        shop_phone: "555",
      }),
    ).toBe("Hi Ana, your 2021 Toyota Camry is ready for pickup at Joe's! Questions? Call 555."));
});

describe("timers", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3h 05m");
  });
  it("marks an ETA due within 15 minutes as soon and past due as late", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(etaState("2026-01-01T12:10:00Z", now)?.tone).toBe("soon");
    expect(etaState("2026-01-01T13:00:00Z", now)?.tone).toBe("ok");
    expect(etaState("2026-01-01T11:59:00Z", now)?.tone).toBe("late");
  });
});

describe("database errors", () => {
  it("reads the cooldown retry time", () => {
    const e = parseAppError({
      message: "COOLDOWN_ACTIVE",
      details: "Cooldown active",
      hint: '{"retryAfterSeconds":9}',
    });
    expect(e.code).toBe("COOLDOWN_ACTIVE");
    expect(e.retryAfterSeconds).toBe(9);
  });
  it("explains a missing technician when starting work", () =>
    expect(parseAppError({ message: "TECHNICIAN_REQUIRED" }).message).toBe(
      "Assign a technician before starting work.",
    ));
  it("explains an unsent inspection when leaving the inspection step", () =>
    expect(parseAppError({ message: "DVI_NOT_SENT" }).message).toBe(
      "Send the inspection to the customer before moving on.",
    ));
});
