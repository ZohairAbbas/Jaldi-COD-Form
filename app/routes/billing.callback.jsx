/**
 * Billing Callback Route
 *
 * Handles the redirect from Shopify after charge approval.
 * Redirects to the Shopify admin to properly re-enter the embedded app.
 */

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const chargeId = url.searchParams.get('charge_id');

  console.log('[Billing Callback] Received callback from Shopify');
  console.log('[Billing Callback] Shop:', shop);
  console.log('[Billing Callback] Charge ID:', chargeId);

  if (!shop) {
    console.error('[Billing Callback] Missing shop parameter');
    throw new Response('Missing shop parameter', { status: 400 });
  }

  // Extract shop name without .myshopify.com for admin URL
  const shopName = shop.replace('.myshopify.com', '');

  // Get the app URL path to redirect to (include /app prefix)
  const appPath = chargeId ? 'app/billing?charge_approved=true' : 'app/billing';

  // Get app handle from env or extract from app URL
  let appHandle = process.env.SHOPIFY_APP_HANDLE;
  if (!appHandle) {
    // Try to extract from SHOPIFY_APP_URL domain
    const appUrl = process.env.SHOPIFY_APP_URL || '';
    const urlMatch = appUrl.match(/\/\/([^.]+)\./);
    appHandle = urlMatch ? urlMatch[1] : 'preventify-app';
    console.warn('[Billing Callback] SHOPIFY_APP_HANDLE not set, using inferred:', appHandle);
  }

  // Construct the Shopify admin URL that will embed the app
  // Format: https://admin.shopify.com/store/{shop}/apps/{app-handle}/app/{path}
  const shopifyAdminUrl = `https://admin.shopify.com/store/${shopName}/apps/${appHandle}/${appPath}`;

  console.log('[Billing Callback] Redirecting to Shopify admin:', shopifyAdminUrl);

  // Return HTML that redirects using window.top to break out of any iframe
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting...</title>
        <script>
          window.top.location.href = "${shopifyAdminUrl}";
        </script>
      </head>
      <body>
        <p>Redirecting back to app...</p>
      </body>
    </html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
};
