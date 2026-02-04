import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { getSubscription } from "../lib/mantle.server";
import MixpanelProvider from "../components/MixpanelProvider";
import BillingBanner from "../components/BillingBanner";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Get shop and subscription data for billing banner and analytics
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const subscription = await getSubscription(shop.id);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: {
      id: shop.id,
      shopifyDomain: shop.shopifyDomain,
      country: shop.country,
      enableMultiCountry: shop.enableMultiCountry,
      hasFormConfig: !!shop.formConfig,
      hasSettings: !!shop.settings,
    },
    subscription,
    ENV: {
      MIXPANEL_TOKEN: process.env.MIXPANEL_TOKEN || "",
    },
    user: {
      email: session.email,
      name: session.firstName ? `${session.firstName} ${session.lastName || ''}`.trim() : null,
    },
  };
};

export default function App() {
  const { apiKey, shop, subscription, ENV, user } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <MixpanelProvider shop={shop} user={user}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(ENV)};`,
          }}
        />
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/form-designer">Form Designer</s-link>
          <s-link href="/app/settings">Settings</s-link>
          <s-link href="/app/sales-booster">Sales Booster</s-link>
          <s-link href="/app/shipping-rates">Shipping Rates</s-link>
          <s-link href="/app/orders">Orders</s-link>
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/billing">Billing</s-link>
        </s-app-nav>
        <div style={{ padding: '16px' }}>
          <BillingBanner subscription={subscription} />
          <Outlet />
        </div>
      </MixpanelProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
