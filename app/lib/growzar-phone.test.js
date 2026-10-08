import { describe, expect, test } from "vitest";
import { normalizePhoneE164, phoneFields } from "./growzar-phone";

// Made-up numbers only.
describe("normalizePhoneE164", () => {
  test("a local Pakistani mobile with the shop's region", () => {
    expect(normalizePhoneE164("0300 1234567", "PK")).toEqual({ phone: "+923001234567", reason: null });
  });

  test("the same number written three ways gives one answer", () => {
    for (const raw of ["03001234567", "+92 300 1234567", "923001234567", "00923001234567"]) {
      expect(normalizePhoneE164(raw, "PK").phone).toBe("+923001234567");
    }
  });

  test("a + number ignores the region", () => {
    expect(normalizePhoneE164("+971501234567", "PK").phone).toBe("+971501234567");
  });

  test("a local number without a region is null, never a guess", () => {
    expect(normalizePhoneE164("03001234567", null)).toEqual({ phone: null, reason: "no_region" });
  });

  test("GB as the region would have made a UK number; PK does not", () => {
    // The trap the pack warns about: 0300… is a valid UK number.
    expect(normalizePhoneE164("03001234567", "GB").phone).toBe("+443001234567");
    expect(normalizePhoneE164("03001234567", "PK").phone).toBe("+923001234567");
  });

  test("invalid, short and empty values are null", () => {
    expect(normalizePhoneE164("12345", "PK")).toEqual({ phone: null, reason: "invalid" });
    expect(normalizePhoneE164("", "PK")).toEqual({ phone: null, reason: "empty" });
    expect(normalizePhoneE164(null, "PK")).toEqual({ phone: null, reason: "empty" });
    expect(normalizePhoneE164("n/a", "PK")).toEqual({ phone: null, reason: "invalid" });
  });

  test("two valid readings that differ are ambiguous", () => {
    // Valid as a German national number AND as +49 15123456789.
    expect(normalizePhoneE164("4915123456789", "DE")).toEqual({ phone: null, reason: "ambiguous" });
  });

  test("phoneFields keeps the raw value beside the normalized one", () => {
    expect(phoneFields("0300-1234567", "PK")).toEqual({ phone: "+923001234567", phoneRaw: "0300-1234567" });
    expect(phoneFields("", "PK")).toEqual({ phone: null, phoneRaw: null });
  });
});
