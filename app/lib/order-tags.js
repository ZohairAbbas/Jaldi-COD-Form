/**
 * Build the Shopify tag list for an order, honouring the merchant's tag toggles.
 *
 * Tags come in three groups, each switchable in Settings → General → Order Tags:
 *   base         — "preventify_cod_form" / "preventify_payfast" /
 *                  "draft_order_for_card_checkout" (source identification)
 *   verification — one of VERIFICATION_TAGS (see verification.server.js)
 *   risk         — preventify-high-risk / -medium-risk / -trusted-buyer
 *
 * A missing setting counts as enabled, so shops whose Settings row predates the
 * toggles keep getting every tag.
 *
 * @param {object} params
 * @param {string[]} params.baseTags
 * @param {string|null} [params.verificationMethod]
 * @param {string|null} [params.riskLevel]
 * @param {object|null} [params.settings] Shop Settings row.
 * @returns {string[]}
 */
export function buildOrderTags({ baseTags = [], verificationMethod = null, riskLevel = null, settings = null }) {
  const enabled = (key) => settings?.[key] !== false;

  const riskTag =
    riskLevel === "HIGH" ? "preventify-high-risk"
    : riskLevel === "MEDIUM" ? "preventify-medium-risk"
    : riskLevel === "LOW" ? "preventify-trusted-buyer"
    : null;

  return [
    ...(enabled("enableSourceTags") ? baseTags : []),
    enabled("enableVerificationTags") ? verificationMethod : null,
    enabled("enableRiskTags") ? riskTag : null,
  ].filter(Boolean);
}
