import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Normalizes a phone number to E.164 (e.g. +15551234567). Returns null when invalid. */
export function toE164(input: string, defaultCountry: CountryCode = "US"): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatNational() : e164;
}
