import { describe, test, expect } from "vitest";
import { buildOrderTags } from "./order-tags";

const BASE = ["preventify_cod_form"];

describe("buildOrderTags", () => {
  test("all groups on by default when settings are missing", () => {
    expect(
      buildOrderTags({ baseTags: BASE, verificationMethod: "sms_otp_verified", riskLevel: "HIGH" })
    ).toEqual(["preventify_cod_form", "sms_otp_verified", "preventify-high-risk"]);
  });

  test("maps each risk level to its tag and ignores unknown", () => {
    expect(buildOrderTags({ riskLevel: "MEDIUM" })).toEqual(["preventify-medium-risk"]);
    expect(buildOrderTags({ riskLevel: "LOW" })).toEqual(["preventify-trusted-buyer"]);
    expect(buildOrderTags({ riskLevel: "UNKNOWN" })).toEqual([]);
  });

  test("a null verification method adds no tag", () => {
    expect(buildOrderTags({ baseTags: BASE, verificationMethod: null })).toEqual(BASE);
  });

  test("each toggle removes only its own group", () => {
    const params = { baseTags: BASE, verificationMethod: "verification_skipped", riskLevel: "LOW" };
    expect(buildOrderTags({ ...params, settings: { enableSourceTags: false } })).toEqual([
      "verification_skipped",
      "preventify-trusted-buyer",
    ]);
    expect(buildOrderTags({ ...params, settings: { enableVerificationTags: false } })).toEqual([
      "preventify_cod_form",
      "preventify-trusted-buyer",
    ]);
    expect(buildOrderTags({ ...params, settings: { enableRiskTags: false } })).toEqual([
      "preventify_cod_form",
      "verification_skipped",
    ]);
  });

  test("everything off yields no tags", () => {
    const settings = { enableSourceTags: false, enableVerificationTags: false, enableRiskTags: false };
    expect(
      buildOrderTags({ baseTags: BASE, verificationMethod: "sms_otp_verified", riskLevel: "HIGH", settings })
    ).toEqual([]);
  });
});
