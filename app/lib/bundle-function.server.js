// ---------------------------------------------------------------------------
// Native-checkout bundles: Discount Function config sync + auto-created
// automatic discount.
//
// The bundle Discount Function (extensions/bundle-discount) reads its tier
// config from a metafield on the automatic-discount node it powers
// (namespace `$app:bundle-discount`, key `config`). This module:
//   1. builds that config JSON from the shop's published bundles, and
//   2. ensures a single automatic app discount exists that runs the function,
//      writing the config metafield on it (create, or update if it already
//      exists — idempotent via Shop.bundleDiscountId).
//
// Called from the bundle publish action alongside syncStorefrontConfigByDomain.
// Every failure is swallowed so a metafield/discount hiccup never breaks the
// merchant's save — native-bundle mode simply won't apply until the next sync.
// ---------------------------------------------------------------------------
import prisma from "../db.server.js";

// Must match the namespace/key in the function's input query
// (extensions/bundle-discount/src/cart_lines_discounts_generate_run.graphql).
const CONFIG_NAMESPACE = "$app:bundle-discount";
const CONFIG_KEY = "config";
const DISCOUNT_TITLE = "Preventify Bundles (do not delete)";

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/**
 * Build the Discount Function config from a shop's published offers.
 * Only the fields the function needs for matching + discount math are included.
 *
 * Quantity breaks and combos share the Bundle table and are emitted as two
 * separate arrays, because the function matches them differently: a tier looks
 * at how many units of ONE product the cart holds, a combo at whether every one
 * of its component products is present.
 */
export function buildBundleFunctionConfig(shopData) {
  const all = shopData.bundles || [];

  const combos = all
    .filter((bundle) => bundle.bundleType === "combo")
    .map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      items: parseJson(bundle.comboItems, []).map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Number(item.quantity) || 1),
      })),
      discountType: bundle.comboDiscountType,
      discountValue: bundle.comboDiscountValue,
    }))
    // A combo needs at least two components to mean anything.
    .filter((combo) => combo.items.length >= 2);

  const bundles = all
    .filter((bundle) => (bundle.bundleType || "quantity") === "quantity")
    .map((bundle) => {
      const productIds =
        typeof bundle.productIds === "string"
          ? JSON.parse(bundle.productIds)
          : bundle.productIds || [];
      const tiers =
        typeof bundle.tiers === "string" ? JSON.parse(bundle.tiers) : bundle.tiers || [];
      return {
        applyOn: bundle.applyOn || "all",
        productIds,
        tiers: tiers.map((t) => ({
          quantity: t.quantity,
          discountType: t.discountType,
          discountValue: t.discountValue,
          bogoBuyX: t.bogoBuyX,
          priceRounding: t.priceRounding,
          priceRoundingValue: t.priceRoundingValue,
        })),
      };
    });

  return { bundles, combos };
}

async function findBundleFunctionId(admin) {
  const res = await admin.graphql(`#graphql
    query BundleDiscountFunctions {
      shopifyFunctions(first: 25, apiType: "discount") {
        nodes { id title apiType }
      }
    }`);
  const json = await res.json();
  const nodes = json?.data?.shopifyFunctions?.nodes || [];
  // The extension handle is "bundle-discount"; match on the function title
  // Shopify derives from it, falling back to the sole discount function.
  const match =
    nodes.find((n) => /bundle[-\s]?discount/i.test(n.title || "")) || nodes[0];
  return match?.id || null;
}

const CREATE = `#graphql
  mutation CreateBundleDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount { discountId title status }
      userErrors { field message }
    }
  }`;

const UPDATE = `#graphql
  mutation UpdateBundleDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }`;

const EXISTS = `#graphql
  query BundleDiscountExists($id: ID!) {
    automaticDiscountNode(id: $id) {
      id
      automaticDiscount { __typename ... on DiscountAutomaticApp { title status } }
    }
  }`;

function discountInput(functionId, configValue) {
  return {
    title: DISCOUNT_TITLE,
    functionId,
    // Required by the API. Start immediately; no end date (runs indefinitely).
    startsAt: new Date().toISOString(),
    // Per-line product discounts (the function emits productDiscountsAdd).
    discountClasses: ["PRODUCT"],
    // Bundle discounts shouldn't silently block the merchant's other discounts.
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true,
    },
    metafields: [
      {
        namespace: CONFIG_NAMESPACE,
        key: CONFIG_KEY,
        type: "json",
        value: configValue,
      },
    ],
  };
}

/**
 * Ensure the automatic bundle discount exists and its config metafield is
 * up to date. Creates it on first call (storing the GID on Shop), updates it
 * on subsequent calls. No-op-safe: any failure is logged and swallowed.
 *
 * @param {object} admin     Admin GraphQL client from authenticate.admin()
 * @param {object} shopData  Shop record with `bundles` + `id` + `bundleDiscountId`
 */
export async function ensureBundleDiscount(admin, shopData) {
  try {
    const config = buildBundleFunctionConfig(shopData);
    const configValue = JSON.stringify(config);

    const functionId = await findBundleFunctionId(admin);
    if (!functionId) {
      console.warn(
        "[Preventify] ensureBundleDiscount: no discount function found (not deployed yet?)",
      );
      return { success: false, error: "function-not-found" };
    }

    // If we already created it AND it still exists, update in place.
    if (shopData.bundleDiscountId) {
      const existsRes = await admin.graphql(EXISTS, {
        variables: { id: shopData.bundleDiscountId },
      });
      const existsJson = await existsRes.json();
      if (existsJson?.data?.automaticDiscountNode?.id) {
        const res = await admin.graphql(UPDATE, {
          variables: {
            id: shopData.bundleDiscountId,
            automaticAppDiscount: discountInput(functionId, configValue),
          },
        });
        const json = await res.json();
        const errs = json?.data?.discountAutomaticAppUpdate?.userErrors || [];
        if (errs.length) {
          console.warn("[Preventify] bundle discount update errors:", JSON.stringify(errs));
          return { success: false, errors: errs };
        }
        return { success: true, action: "updated" };
      }
      // Stored id is stale (merchant deleted it) — fall through to recreate.
    }

    const res = await admin.graphql(CREATE, {
      variables: { automaticAppDiscount: discountInput(functionId, configValue) },
    });
    const json = await res.json();
    const errs = json?.data?.discountAutomaticAppCreate?.userErrors || [];
    if (errs.length) {
      console.warn("[Preventify] bundle discount create errors:", JSON.stringify(errs));
      return { success: false, errors: errs };
    }
    const discountId = json?.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId;
    if (discountId) {
      await prisma.shop.update({
        where: { id: shopData.id },
        data: { bundleDiscountId: discountId },
      });
    }
    return { success: true, action: "created", discountId };
  } catch (error) {
    console.error("[Preventify] ensureBundleDiscount failed:", error);
    return { success: false, error: String(error) };
  }
}
