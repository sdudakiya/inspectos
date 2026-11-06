export interface AppErrorInfo {
  code: string;
  message: string;
  retryAfterSeconds?: number;
  currentVersion?: number;
}

const FRIENDLY: Record<string, string> = {
  COOLDOWN_ACTIVE: "Just changed — wait a moment before moving it again.",
  PARTS_VENDOR_REQUIRED: "Pick a parts vendor for this status.",
  QC_SIGNOFF_REQUIRED: "Quality control sign-off is required to complete this order.",
  DVI_REQUIRED: "The inspection must be approved by the customer first.",
  STALE_VERSION: "Someone else just updated this order. The board has been refreshed.",
  ALREADY_IN_STATUS: "The order is already in that status.",
  ORDER_ARCHIVED: "This order is archived.",
  REOPEN_NOT_ALLOWED: "Only an owner can reopen a completed order.",
  BAY_OCCUPIED: "That bay is already occupied.",
  TECHNICIAN_REQUIRED: "Assign a technician before starting work.",
  DVI_NOT_SENT: "Send the inspection to the customer before moving on.",
  FORBIDDEN: "You don't have permission to do that.",
  PORTAL_LINK_INVALID: "This link is not valid or has expired.",
  PORTAL_ALREADY_AUTHORIZED: "This inspection has already been authorized.",
};

/** Parses errors raised by database functions: message = CODE, details = text, hint = JSON extras. */
export function parseAppError(err: unknown): AppErrorInfo {
  const e = (err ?? {}) as { message?: string; details?: string; hint?: string };
  const raw = e.message ?? "Something went wrong";
  const code = /^[A-Z_]+$/.test(raw) ? raw : "INTERNAL";
  let extra: Record<string, unknown> = {};
  if (e.hint) {
    try {
      extra = JSON.parse(e.hint);
    } catch {
      extra = {};
    }
  }
  const message =
    code === "INTERNAL"
      ? raw
      : e.details && !FRIENDLY[code]
        ? e.details
        : (FRIENDLY[code] ?? e.details ?? raw);
  return {
    code,
    message: code === "BAY_OCCUPIED" && e.details ? e.details : message,
    ...(typeof extra["retryAfterSeconds"] === "number"
      ? { retryAfterSeconds: extra["retryAfterSeconds"] }
      : {}),
    ...(typeof extra["currentVersion"] === "number"
      ? { currentVersion: extra["currentVersion"] }
      : {}),
  };
}
