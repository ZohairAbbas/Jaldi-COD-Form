/**
 * Mixpanel Provider Component
 *
 * Initializes Mixpanel tracking and session recording
 * Should be placed at the root of the application
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { initMixpanel, identifyUser, trackPageView } from '../lib/mixpanel.client';

export default function MixpanelProvider({ children, shop, user }) {
  const location = useLocation();

  // Initialize Mixpanel on mount
  useEffect(() => {
    const token = window.ENV?.MIXPANEL_TOKEN;
    if (token) {
      initMixpanel(token);
      console.log('Mixpanel initialized');
    }
  }, []);

  // Identify user
  useEffect(() => {
    if (shop?.shopifyDomain) {
      identifyUser(shop.shopifyDomain, {
        shop_domain: shop.shopifyDomain,
        shop_id: shop.id,
        country: shop.country,
        multi_country_enabled: shop.enableMultiCountry,
        has_form_config: shop.hasFormConfig,
        has_settings: shop.hasSettings,
        user_email: user?.email,
        user_name: user?.name,
      });
    }
  }, [shop, user]);

  // Track page views
  useEffect(() => {
    trackPageView(location.pathname, {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [location]);

  return <>{children}</>;
}
