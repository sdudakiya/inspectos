import { toE164 } from "@/lib/phone";

export type CheckinFields = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  odometer: string;
  eta: string;
};

/** Returns a map of field → error message. Customer/vehicle fields are skipped when an existing record is picked. */
export function validateCheckin(
  f: CheckinFields,
  opts: { existingCustomer: boolean; existingVehicle: boolean },
  maxYear = new Date().getFullYear() + 1,
) {
  const e: Partial<Record<keyof CheckinFields, string>> = {};
  if (!opts.existingCustomer) {
    if (!f.firstName.trim()) e.firstName = "First name is required";
    if (!f.lastName.trim()) e.lastName = "Last name is required";
    if (!f.phone.trim()) e.phone = "Mobile number is required";
    else if (!toE164(f.phone)) e.phone = "Enter a valid mobile number";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      e.email = "Enter a valid email";
  }
  if (!opts.existingVehicle) {
    const y = Number(f.year);
    if (!f.year.trim()) e.year = "Year is required";
    else if (!Number.isInteger(y) || y < 1900 || y > maxYear)
      e.year = `Year must be 1900–${maxYear}`;
    if (!f.make.trim()) e.make = "Make is required";
    if (!f.model.trim()) e.model = "Model is required";
    if (f.vin.trim() && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(f.vin.trim()))
      e.vin = "VIN must be 17 letters/numbers (no I, O, Q)";
    if (f.odometer.trim() && !/^\d+$/.test(f.odometer.trim())) e.odometer = "Whole number only";
  }
  if (f.eta.trim() && !/^\d+$/.test(f.eta.trim())) e.eta = "Minutes as a whole number";
  return e;
}
