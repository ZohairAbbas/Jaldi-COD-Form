import { useLoaderData, Link, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getDashboardStats } from "../lib/db.server";
import { getCurrencyCode } from "../lib/constants";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // Get or create shop with default configuration
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get dashboard stats for last 7 days
  const stats = await getDashboardStats(shop.id);

  // Check theme app embed status and get shop currency
  let themeAppEmbedStatus = {
    enabled: false,
    themeId: null,
    themeIdNumeric: null,
  };
  let shopCurrency = getCurrencyCode(shop.country); // Default fallback based on shop country

  try {
    // Query for main theme, app embeds, and shop currency
    const response = await admin.graphql(
      `#graphql
        query {
          currentAppInstallation {
            id
          }
          themes(first: 1, roles: MAIN) {
            nodes {
              id
              name
            }
          }
          shop {
            currencyCode
          }
        }
      `
    );

    const data = await response.json();

    // Extract shop currency
    if (data.data?.shop?.currencyCode) {
      shopCurrency = data.data.shop.currencyCode;
    }

    if (data.data?.themes?.nodes?.[0]) {
      const mainTheme = data.data.themes.nodes[0];
      themeAppEmbedStatus.themeId = mainTheme.id;

      // Get the numeric theme ID from the GID
      const themeIdMatch = mainTheme.id.match(/Theme\/(\d+)/);
      if (themeIdMatch) {
        themeAppEmbedStatus.themeIdNumeric = themeIdMatch[1];

        // Check if app embed is enabled by using REST API
        try {
          const themeAssetUrl = `https://${session.shop}/admin/api/2026-01/themes/${themeIdMatch[1]}/assets.json?asset[key]=config/settings_data.json`;

          const assetResponse = await fetch(themeAssetUrl, {
            headers: {
              'X-Shopify-Access-Token': session.accessToken,
              'Content-Type': 'application/json',
            },
          });

          if (assetResponse.ok) {
            const assetData = await assetResponse.json();
            const settingsContent = assetData.asset?.value;

            if (settingsContent) {
              const settings = JSON.parse(settingsContent);
              const appEmbedUUID = "2dc90d2c-a22b-c2f6-dd39-a0cf1161a398602d107a";

              // Check if the app embed is enabled in theme settings
              if (settings.current?.blocks) {
                const appEmbedBlock = Object.values(settings.current.blocks).find(
                  (block) => block.type?.includes(appEmbedUUID) || block.type?.includes("preventify")
                );

                if (appEmbedBlock) {
                  themeAppEmbedStatus.enabled = appEmbedBlock.disabled === false;
                }
              }
            }
          }
        } catch (embedError) {
          console.error("Error checking app embed status:", embedError);
          themeAppEmbedStatus.enabled = false;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching theme app embed status:", error);
  }

  // Get setup progress or initialize with defaults
  const setupProgress = shop.setupProgress || {
    step1Completed: false,
    step2Completed: false,
    welcomeDismissed: false,
    setupGuideDismissed: false,
  };

  return {
    shop: {
      domain: shop.shopifyDomain,
      hasFormConfig: !!shop.formConfig,
      hasSettings: !!shop.settings,
      currency: shopCurrency,
    },
    stats,
    themeAppEmbedStatus,
    setupProgress,
  };
};

export default function Index() {
  const { stats, themeAppEmbedStatus, shop, setupProgress } = useLoaderData();
  const fetcher = useFetcher();
  const [welcomeVisible, setWelcomeVisible] = useState(!setupProgress.welcomeDismissed);

  // App embed UUID from extension config
  const appEmbedUUID = "2dc90d2c-a22b-c2f6-dd39-a0cf1161a398602d107a";

  // Generate theme editor URL with app embed context
  const themeEditorUrl = themeAppEmbedStatus.themeIdNumeric
    ? `https://admin.shopify.com/store/${shop.domain.replace('.myshopify.com', '')}/themes/${themeAppEmbedStatus.themeIdNumeric}/editor?context=apps&appEmbed=${appEmbedUUID}%2Fapp-embed`
    : `https://admin.shopify.com/store/${shop.domain.replace('.myshopify.com', '')}/themes`;

  // Calculate completed steps (now only 2 steps)
  const completedSteps = [
    setupProgress.step1Completed,
    setupProgress.step2Completed,
  ].filter(Boolean).length;

  const allTasksCompleted = completedSteps === 2;

  // Track expanded state for collapsible sections
  const [expandedStep, setExpandedStep] = useState(
    !setupProgress.step1Completed ? 1 : (!setupProgress.step2Completed ? 2 : null)
  );

  const [setupGuideDismissed, setSetupGuideDismissed] = useState(setupProgress.setupGuideDismissed || false);

  const handleStepToggle = (step) => {
    setExpandedStep(expandedStep === step ? null : step);
  };

  const handleCompleteStep = (stepNum) => {
    // Only allow marking as complete, not uncompleting
    const isCompleted = stepNum === 1 ? setupProgress.step1Completed : setupProgress.step2Completed;

    if (!isCompleted) {
      fetcher.submit(
        { action: `completeStep${stepNum}`, value: true },
        { method: "POST", action: "/api/setup-progress", encType: "application/json" }
      );
    }
  };

  const handleDismissSetupGuide = () => {
    setSetupGuideDismissed(true);
    fetcher.submit(
      { action: "dismissSetupGuide" },
      { method: "POST", action: "/api/setup-progress", encType: "application/json" }
    );
  };

  const handleDismissWelcome = () => {
    setWelcomeVisible(false);
    fetcher.submit(
      { action: "dismissWelcome" },
      { method: "POST", action: "/api/setup-progress", encType: "application/json" }
    );
  };

  return (
    <s-page heading="Preventify COD Form">
      {/* WhatsApp Support Button */}
      <a
        href="https://wa.me/923362172665"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: '#25D366',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 1000,
          textDecoration: 'none',
        }}
        title="Chat with support on WhatsApp"
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 2C8.268 2 2 8.268 2 16c0 2.46.664 4.763 1.822 6.74L2 30l7.463-1.793A13.94 13.94 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="#25D366"/>
          <path d="M16 4c6.627 0 12 5.373 12 12s-5.373 12-12 12a11.95 11.95 0 01-5.88-1.54l-.42-.25-4.43 1.064 1.1-4.317-.275-.444A11.95 11.95 0 014 16C4 9.373 9.373 4 16 4z" fill="#fff"/>
          <path d="M12.387 10c-.23 0-.6.086-.916.43-.315.344-1.203 1.175-1.203 2.866 0 1.692 1.231 3.327 1.402 3.556.172.229 2.4 3.8 5.896 5.178 2.919 1.15 3.512.921 4.146.864.634-.057 2.045-.836 2.332-1.643.287-.806.287-1.497.2-1.64-.086-.143-.315-.23-.66-.402-.344-.172-2.036-1.004-2.352-1.119-.315-.114-.544-.172-.773.172-.23.344-.888 1.119-1.088 1.348-.2.23-.4.258-.745.086-.344-.172-1.453-.536-2.768-1.707-1.023-.912-1.714-2.038-1.914-2.382-.2-.344-.022-.53.15-.702.154-.154.344-.402.516-.603.172-.2.229-.344.344-.573.114-.23.057-.43-.029-.603-.086-.172-.756-1.869-1.05-2.554-.273-.657-.553-.569-.773-.58L12.387 10z" fill="#25D366"/>
        </svg>
      </a>
      {/* Welcome Banner */}
      {welcomeVisible && (
        <s-section>
          <div style={{
            borderRadius: '8px',
            border: '1px solid #e3e3e3',
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            {/* Header with colored background */}
            <div style={{
              backgroundColor: '#059c5dff',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e3e3e3'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="10" cy="10" r="9" stroke="#fff" strokeWidth="1.5" fill="none"/>
                  <path d="M10 6v5M10 14v0.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Welcome to Preventify COD Form & Upsells!
                </span>
              </div>
              <button
                onClick={handleDismissWelcome}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}
                aria-label="Dismiss"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Body with white background */}
            <div style={{ backgroundColor: '#fff', padding: '16px 20px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#303030', lineHeight: '1.6' }}>
                Thank you for joining Preventify COD-form app! We are so thrilled to have you onboard.
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7177', lineHeight: '1.6' }}>
                Preventify COD Form & Upsells lets you create fully customizable, single-page order form tailored for Cash on Delivery orders. It provides complete flexibility in managing COD order collection while helping boost conversions, reduce fake or fraudulent orders, and drive higher sales through powerful built-in upsell options.
              </p>
            </div>
          </div>
        </s-section>
      )}

      {/* Theme App Embed Status Bar */}
      <s-section>
        <s-card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H8V8H4V4Z" fill="currentColor"/>
                <path d="M4 12H8V16H4V12Z" fill="currentColor"/>
                <path d="M12 4H16V8H12V4Z" fill="currentColor"/>
                <path d="M12 12H16V16H12V12Z" fill="currentColor"/>
              </svg>
              <span style={{ fontWeight: 500 }}>Theme App Embed</span>
              <s-badge tone={themeAppEmbedStatus.enabled ? "success" : "default"}>
                {themeAppEmbedStatus.enabled ? "ON" : "OFF"}
              </s-badge>
            </div>
            <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer">
              <s-button>Open Theme</s-button>
            </a>
          </div>
        </s-card>
      </s-section>

      {/* Stats Cards - Last 7 Days */}
      <s-section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 17V7h4v10H3zm5 0V3h4v14H8zm5 0v-6h4v6h-4z" fill="currentColor"/>
          </svg>
          <span style={{ fontWeight: 500 }}>Last 7 days:</span>
        </div>
        <s-card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', textAlign: 'center', borderRight: '1px solid #e3e3e3' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>{stats.formOpens}</div>
              <div style={{ fontSize: '13px', color: '#6b7177' }}>Form opens</div>
            </div>
            <div style={{ padding: '24px', textAlign: 'center', borderRight: '1px solid #e3e3e3' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>{stats.orderCount}</div>
              <div style={{ fontSize: '13px', color: '#6b7177' }}>Orders</div>
            </div>
            <div style={{ padding: '24px', textAlign: 'center', borderRight: '1px solid #e3e3e3' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>
                {shop.currency} {stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7177' }}>Revenue</div>
            </div>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>{stats.conversionRate}%</div>
              <div style={{ fontSize: '13px', color: '#6b7177' }}>Form conversion rate</div>
            </div>
          </div>
        </s-card>
      </s-section>

      {/* Setup Guide Section */}
      {!setupGuideDismissed && (
        <s-section>
          <s-card>
            <div style={{ padding: '16px 20px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#303030' }}>
                Setup Guide
              </h3>
              <p style={{ margin: '0 0 16px 0', color: '#6b7177', fontSize: '13px' }}>
                Use this guide to get your form up and running.
              </p>
              {allTasksCompleted ? (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" fill="#2a9d5c"/>
                      <path d="M14 7L8.5 13L6 10.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#2a9d5c' }}>Done!</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <span style={{ fontSize: '14px', color: '#6b7177' }}>{completedSteps} of 2 tasks completed</span>
                  <div style={{ flex: 1, maxWidth: '200px', height: '8px', backgroundColor: '#e3e3e3', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(completedSteps / 2) * 100}%`, height: '100%', backgroundColor: '#2a9d5c', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              )}

            {/* Step 1: Enable form */}
            <div style={{ borderBottom: expandedStep === 1 ? 'none' : '1px solid #e3e3e3', marginBottom: '0' }}>
              <div
                onClick={() => handleStepToggle(1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px 0',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCompleteStep(1);
                  }}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: setupProgress.step1Completed ? 'none' : '2px solid #8c9196',
                    backgroundColor: setupProgress.step1Completed ? '#2a9d5c' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {setupProgress.step1Completed && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontWeight: 500, fontSize: '14px', flex: 1 }}>Enable form</span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  style={{ transform: expandedStep === 1 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                >
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="#5c5f62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {expandedStep === 1 && (
                <div style={{ paddingLeft: '32px', paddingBottom: '16px' }}>
                  <s-card>
                    <div style={{ padding: '16px' }}>

                      <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                        <span>1. First, Open your theme by clicking on this button: </span>
                        <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginLeft: '8px' }}>
                          <button style={{
                            backgroundColor: '#303030',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M11 7.5V11.5C11 12.0523 10.5523 12.5 10 12.5H2.5C1.94772 12.5 1.5 12.0523 1.5 11.5V4C1.5 3.44772 1.94772 3 2.5 3H6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M9 1.5H12.5V5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12.5 1.5L6.5 7.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            Open theme
                          </button>
                        </a>
                      </div>

                      <div style={{ marginBottom: '16px', fontSize: '14px' }}>
                        2. In the theme editor, click the <strong>Save</strong> button located at the top-right corner.
                      </div>

                    </div>
                  </s-card>
                </div>
              )}
            </div>

            {/* Step 2: Customize */}
            <div>
              <div
                onClick={() => handleStepToggle(2)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px 0',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCompleteStep(2);
                  }}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: setupProgress.step2Completed ? 'none' : '2px solid #8c9196',
                    backgroundColor: setupProgress.step2Completed ? '#2a9d5c' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {setupProgress.step2Completed && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontWeight: 500, fontSize: '14px', flex: 1 }}>Customize</span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  style={{ transform: expandedStep === 2 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                >
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="#5c5f62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {expandedStep === 2 && (
                <div style={{ paddingLeft: '32px', paddingBottom: '16px' }}>
                  <s-card>
                    <div style={{ padding: '16px' }}>
                      <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>
                        Customize your COD form to match your brand and preferences.
                      </p>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <Link to="/app/form-designer" style={{ textDecoration: 'none' }}>
                          <button style={{
                            backgroundColor: '#303030',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}>
                            Form Designer
                          </button>
                        </Link>
                        <Link to="/app/settings" style={{ textDecoration: 'none' }}>
                          <button style={{
                            backgroundColor: 'white',
                            color: '#303030',
                            border: '1px solid #c9cccf',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}>
                            Settings
                          </button>
                        </Link>
                      </div>
                    </div>
                  </s-card>
                </div>
              )}
            </div>

            {/* Dismiss button at bottom right */}
            {allTasksCompleted && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #e3e3e3' }}>
                <button
                  onClick={handleDismissSetupGuide}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #c9cccf',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: '#303030'
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </s-card>
      </s-section>
      )}

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
