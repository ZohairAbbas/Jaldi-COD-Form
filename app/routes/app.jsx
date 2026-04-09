import { Outlet, useLoaderData, useRouteError, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getMonthlyOrderCount } from "../lib/db.server";
import { getSubscription } from "../lib/mantle.server";
import { getPlanLimit, getUsagePercentage, getUsageStatus } from "../lib/plan-limits";
import MixpanelProvider from "../components/MixpanelProvider";
import BillingBanner from "../components/BillingBanner";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Get shop and subscription data for billing banner and analytics
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const subscription = await getSubscription(shop.id);

  // Compute plan usage for billing banner
  const monthlyOrderCount = await getMonthlyOrderCount(shop.id);
  const planName = subscription?.planName || 'Free';
  const planLimit = getPlanLimit(planName);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isAdmin: session.shop === process.env.ADMIN_SHOP,
    shop: {
      id: shop.id,
      shopifyDomain: shop.shopifyDomain,
      country: shop.country,
      enableMultiCountry: shop.enableMultiCountry,
      hasFormConfig: !!shop.formConfig,
      hasSettings: !!shop.settings,
    },
    subscription,
    planUsage: {
      planName,
      monthlyOrderCount,
      planLimit,
      usagePercentage: getUsagePercentage(monthlyOrderCount, planLimit),
      usageStatus: getUsageStatus(monthlyOrderCount, planLimit),
    },
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
  const { apiKey, shop, subscription, planUsage, ENV, user, isAdmin } = useLoaderData();
  const navigation = useNavigation();
  const isNavigatingToBilling = navigation.state === 'loading' && navigation.location?.pathname === '/app/billing';

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
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/billing">Billing</s-link>
          {isAdmin && <s-link href="/app/monitor">Monitor</s-link>}
        </s-app-nav>
        <div style={{ padding: '16px' }}>
          <BillingBanner subscription={subscription} planUsage={planUsage} isNavigatingToBilling={isNavigatingToBilling} />
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
