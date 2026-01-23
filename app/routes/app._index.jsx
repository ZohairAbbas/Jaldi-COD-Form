import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Get or create shop with default configuration
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return {
    shop: {
      domain: shop.shopifyDomain,
      hasFormConfig: !!shop.formConfig,
      hasSettings: !!shop.settings,
    },
  };
};

export default function Index() {
  const { shop } = useLoaderData();

  return (
    <s-page heading="COD Form Dashboard">
      <s-section heading="Welcome to Jaldi COD Form">
        <s-paragraph>
          Streamline your Cash on Delivery orders with customizable forms and
          seamless Shopify integration.
        </s-paragraph>
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
          </s-stack>
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
            Start receiving COD orders through Shopify Checkout
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="App Features">
        <s-unordered-list>
          <s-list-item>Fully customizable order forms</s-list-item>
          <s-list-item>Popup and embedded deployment modes</s-list-item>
          <s-list-item>Automatic Shopify order creation</s-list-item>
          <s-list-item>Seamless checkout integration</s-list-item>
          <s-list-item>Custom fields support</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
