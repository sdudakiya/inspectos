import { describe, expect, it } from "vitest";
import { validateCheckin } from "@/lib/checkin-validation";

const base = {
  firstName: "Jo",
  lastName: "Doe",
  phone: "(415) 555-2671",
  email: "",
  year: "2020",
  make: "Honda",
  model: "Civic",
  vin: "",
  odometer: "",
  eta: "",
};
const fresh = { existingCustomer: false, existingVehicle: false };

describe("check-in validation", () => {
  it("accepts a complete new customer and vehicle", () => {
    expect(validateCheckin(base, fresh, 2027)).toEqual({});
  });
  it("rejects an invalid phone", () => {
    expect(validateCheckin({ ...base, phone: "123" }, fresh, 2027).phone).toBe(
      "Enter a valid mobile number",
    );
  });
  it("rejects a year past next model year", () => {
    expect(validateCheckin({ ...base, year: "2028" }, fresh, 2027).year).toBe(
      "Year must be 1900–2027",
    );
  });
  it("rejects a VIN that is not 17 valid characters", () => {
    expect(validateCheckin({ ...base, vin: "1HGCM82633A00435O" }, fresh, 2027).vin).toBeDefined();
  });
  it("skips customer and vehicle fields when existing records are picked", () => {
    const blank = {
      ...base,
      firstName: "",
      lastName: "",
      phone: "",
      year: "",
      make: "",
      model: "",
    };
    expect(validateCheckin(blank, { existingCustomer: true, existingVehicle: true }, 2027)).toEqual(
      {},
    );
  });
});
