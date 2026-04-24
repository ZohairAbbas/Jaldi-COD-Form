import crypto from "crypto";

const BASE_URL = process.env.PAYFAST_BASE_URL || "https://ipg1.apps.net.pk/Ecommerce/api/Transaction";

/**
 * Build HMAC-SHA256 signature by concatenating field values and hashing with the secured key.
 * @param {string[]} fieldValues - Array of field values in prescribed order (no separators)
 * @param {string} securedKey - ASCII-encoded merchant secured key
 * @returns {string} Hex-encoded HMAC-SHA256 digest
 */
export function buildHmac(fieldValues, securedKey) {
  const data = fieldValues.join("");
  return crypto.createHmac("sha256", securedKey).update(data).digest("hex");
}

/**
 * Obtain a short-lived OAuth2 bearer token from PayFast.
 * @param {string} merchantId
 * @param {string} securedKey
 * @param {string} customerIp - End-user IP address (required by PayFast)
 * @returns {{ token: string, refresh_token: string, expiry: number }}
 */
export async function getPayfastToken(merchantId, securedKey, customerIp) {
  const params = new URLSearchParams({
    merchant_id: merchantId,
    secured_key: securedKey,
    grant_type: "client_credentials",
    customer_ip: customerIp || "0.0.0.0",
  });

  const response = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(`PayFast token error: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Validate customer card and trigger OTP / 3DS flow.
 * Corresponds to POST /customer/validate
 * @param {string} accessToken - Bearer token from getPayfastToken()
 * @param {object} payload - All required validate fields
 * @returns PayFast validate response ({ otp_required, transaction_id, eci, data_3ds_html?, ... })
 */
export async function validateCustomer(accessToken, payload) {
  const params = new URLSearchParams(payload);

  const response = await fetch(`${BASE_URL}/customer/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
    },
    body: params.toString(),
  });

  const data = await response.json();
  return data;
}

/**
 * Execute the PayFast transaction with OTP.
 * Corresponds to POST /transaction
 * @param {string} accessToken - Bearer token
 * @param {object} payload - All required transaction fields including otp and secured_hash
 * @returns PayFast transaction response ({ status_code, status_msg, transaction_id, ... })
 */
export async function executeTransaction(accessToken, payload) {
  const params = new URLSearchParams(payload);

  const response = await fetch(`${BASE_URL}/transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
    },
    body: params.toString(),
  });

  const data = await response.json();
  return data;
}

/**
 * Poll transaction status by transaction ID.
 * Corresponds to GET /transaction/<transaction_id>
 * @param {string} accessToken - Bearer token
 * @param {string} transactionId - PayFast transaction ID
 * @returns PayFast status response
 */
export async function getTransactionStatus(accessToken, transactionId) {
  const response = await fetch(`${BASE_URL}/transaction/${encodeURIComponent(transactionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data;
}

/**
 * Returns true if the PayFast status code represents a successful payment.
 * Codes: "00" = processed OK, "79" = alternate success
 */
export function isPayfastSuccess(statusCode) {
  return statusCode === "00" || statusCode === "79";
}

/**
 * Returns true if the status represents a pending/processing state.
 * Code "001" = pending confirmation.
 */
export function isPayfastPending(statusCode) {
  return statusCode === "001";
}
