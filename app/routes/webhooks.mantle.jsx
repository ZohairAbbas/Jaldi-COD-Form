/**
 * Mantle Webhook Handler
 *
 * Receives and processes webhooks from Mantle for subscription events
 */

import { handleMantleWebhook } from '../lib/mantle.server';
import { trackServerEvent } from '../lib/mixpanel.server';

export const action = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await request.json();

    console.log('Received Mantle webhook:', payload.type);

    // Handle the webhook
    await handleMantleWebhook(payload);

    // Track webhook received
    if (payload.data?.myshopifyDomain) {
      trackServerEvent(
        payload.data.myshopifyDomain,
        'Mantle Webhook Received',
        {
          webhook_type: payload.type,
          webhook_id: payload.id,
        }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to handle Mantle webhook:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
