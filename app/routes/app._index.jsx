import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getOrders } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Get or create shop with default configuration
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get recent orders count
  const { total: totalOrders } = await getOrders(shop.id, { limit: 1 });

  return {
    shop: {
      domain: shop.shopifyDomain,
      hasFormConfig: !!shop.formConfig,
      hasSettings: !!shop.settings,
    },
    stats: {
      totalOrders,
    },
  };
};

export default function Index() {
  const { shop, stats } = useLoaderData();

  return (
    <s-page heading="COD Form Dashboard">
      <s-section heading="Welcome to Preventify: COD Form & Upsells">
        <s-paragraph>
          Streamline your Cash on Delivery orders with customizable forms and
          seamless Shopify integration.
        </s-paragraph>
      </s-section>

      <s-section heading="Quick Stats">
        <s-stack direction="block" gap="base">
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-heading>Total COD Orders</s-heading>
              <s-text variant="heading-2xl">{stats.totalOrders}</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Get Started">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Customize your COD order form to match your brand and start
            collecting orders.
          </s-paragraph>

          <s-stack direction="inline" gap="base">
            <Link to="/app/form-designer">
              <s-button variant="primary">Design Your Form</s-button>
            </Link>
            <Link to="/app/settings">
              <s-button>Configure Settings</s-button>
            </Link>
            <Link to="/app/orders">
              <s-button variant="tertiary">View Orders</s-button>
            </Link>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Setup Instructions">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            After configuring your settings, follow these steps to enable the COD
            form on your storefront:
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Step 1: Enable App Embed (Required)</s-text>
              <s-unordered-list>
                <s-list-item>
                  Go to your Shopify theme editor
                </s-list-item>
                <s-list-item>
                  Click "App embeds" in the left sidebar
                </s-list-item>
                <s-list-item>
                  Enable "Preventify COD Form"
                </s-list-item>
                <s-list-item>
                  Save your theme
                </s-list-item>
              </s-unordered-list>
              <s-text variant="body-sm" tone="subdued">
                This will automatically display the form/button at the end of your product and cart sections based on your selected mode above.
              </s-text>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Step 2: Manual Placement (Optional)</s-text>
              <s-paragraph>
                If you want to place the button or form at a specific location instead of the default position:
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>
                  <strong>For Popup Mode:</strong> Add the "Preventify - COD Button" block to your product page template at your desired location
                </s-list-item>
                <s-list-item>
                  <strong>For Embedded Mode:</strong> Add the "Preventify - COD Form" block to your product or cart page template at your desired location
                </s-list-item>
              </s-unordered-list>
              <s-text variant="body-sm" tone="subdued">
                Manual blocks override the default position. The form/button will appear only where you place the block.
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Setup Guide">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/form-designer">
              Customize your form fields and styling
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/settings">
              Choose popup or embedded mode
            </s-link>
          </s-list-item>
          <s-list-item>
            Enable the app on your storefront theme
          </s-list-item>
          <s-list-item>
            <s-link href="/app/orders">
              Start receiving and managing COD orders
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="App Features">
        <s-unordered-list>
          <s-list-item>Fully customizable order forms</s-list-item>
          <s-list-item>Popup and embedded deployment modes</s-list-item>
          <s-list-item>Automatic Shopify order creation</s-list-item>
          <s-list-item>Order management dashboard</s-list-item>
          <s-list-item>Custom fields support</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
