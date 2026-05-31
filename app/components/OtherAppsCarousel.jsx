import { useState } from "react";

// Shared list — paste the SAME array into every Growzar app.
// Each app filters itself out via the `currentHandle` prop.
export const GROWZAR_APPS = [
  {
    handle: "courierify",
    name: "Courierify: Courier Management",
    icon: "https://cdn.shopify.com/app-store/listing_images/cef2dfeb2aaeba9ca1213237d3b2feb5/icon/CO6byoT20ZMDEAE=.png",
    description:
      "Pakistan's most integrated courier management platform for Shopify — book, track, reconcile settlements, and automate customer comms.",
    badge: "New App",
  },
  {
    handle: "financify",
    name: "Financify: COD Profit Analytics",
    icon: "https://cdn.shopify.com/app-store/listing_images/6ca373e1b5889258e7f06f760041448f/icon/CKP0lMOK7I8DEAE=.jpeg",
    description:
      "Real-time, COD-first profit analytics. Track delivery fees, returns, ad spend, and operating costs in one place to know your true margins.",
    badge: "New App",
  },
  {
    handle: "whatkabot",
    name: "WhatKaBot: AI Support + Reviews",
    icon: "https://cdn.shopify.com/app-store/listing_images/d6462912a6286be7143dc307c62a02b5/icon/CJL4nZSXjJQDEAE=.png",
    description:
      "Collect authentic customer reviews over WhatsApp with interactive polls and media uploads, plus AI-powered support on the channel customers prefer.",
    badge: "New App",
  },
  {
    handle: "retainify",
    name: "Retainify — Cart Recovery",
    icon: "https://cdn.shopify.com/app-store/listing_images/772b207205dcd34f8f3eb724972869cc/icon/CI7btqjjpJQDEAE=.png",
    description:
      "Win back abandoned carts with automated, branded recovery emails and exit-intent popups that recapture lost sales on autopilot.",
    badge: "New App",
  },
  {
    handle: "preventify",
    name: "Preventify: COD Form & Upsells",
    icon: "https://cdn.shopify.com/app-store/listing_images/8908d85f0ad3249746e4614bdba226d8/icon/CN6g4fSB0pMDEAE=.png",
    description:
      "Build a 1-click COD order form with pre- and post-purchase upsells, downsells, and OTP fraud prevention to boost conversions and AOV.",
    badge: "New App",
  },
];

export function OtherAppsCarousel({
  currentHandle,
  apps = GROWZAR_APPS,
  utmSource,
}) {
  const list = apps.filter((a) => a.handle !== currentHandle);
  const [index, setIndex] = useState(0);
  if (list.length === 0) return null;

  const app = list[index];
  const total = list.length;
  const source = utmSource || currentHandle;
  const go = (d) => setIndex((p) => (p + d + total) % total);

  const iconBtn = {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #c9cccf',
    background: 'white',
    borderRadius: 6,
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <s-card>
      <div style={{ padding: 16 }}>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="inline" gap="base" align="center">
              <img
                src={app.icon}
                alt={`${app.name} app icon`}
                width={48}
                height={48}
                style={{ borderRadius: 8, display: 'block', flexShrink: 0 }}
              />
              <s-stack direction="block" gap="tight">
                <s-stack direction="inline" gap="tight" align="center">
                  <s-text variant="heading-sm">{app.name}</s-text>
                  {app.badge && <s-badge tone="success">{app.badge}</s-badge>}
                </s-stack>
              </s-stack>
            </s-stack>
            <s-stack direction="inline" gap="tight" align="center">
              {total > 1 && (
                <>
                  <button
                    type="button"
                    style={iconBtn}
                    aria-label="Previous app"
                    onClick={() => go(-1)}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M12 5L7 10L12 15" stroke="#303030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    style={iconBtn}
                    aria-label="Next app"
                    onClick={() => go(1)}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M8 5L13 10L8 15" stroke="#303030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              )}
              <a
                href={`https://apps.shopify.com/${app.handle}?utm_source=${source}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${app.name}`}
                style={{
                  backgroundColor: '#303030',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                View App
              </a>
            </s-stack>
          </s-stack>
          <s-text tone="subdued">{app.description}</s-text>
        </s-stack>
      </div>
    </s-card>
  );
}
