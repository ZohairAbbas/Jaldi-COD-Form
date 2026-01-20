import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get shop from database
  const shopData = await db.shop.findUnique({
    where: { shopifyDomain: shop },
  });

  if (!shopData) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Get analytics data
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Total abandoned carts
  const totalAbandoned = await db.abandonedCart.count({
    where: {
      shopId: shopData.id,
      abandonedAt: { gte: thirtyDaysAgo },
    },
  });

  // Recovered carts
  const recoveredCarts = await db.abandonedCart.count({
    where: {
      shopId: shopData.id,
      recovered: true,
      abandonedAt: { gte: thirtyDaysAgo },
    },
  });

  // Total completed orders
  const totalOrders = await db.order.count({
    where: {
      shopId: shopData.id,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Calculate total value of abandoned carts
  const abandonedCartsData = await db.abandonedCart.findMany({
    where: {
      shopId: shopData.id,
      abandonedAt: { gte: thirtyDaysAgo },
    },
    select: {
      totalAmount: true,
    },
  });

  const totalAbandonedValue = abandonedCartsData.reduce(
    (sum, cart) => sum + cart.totalAmount,
    0
  );

  // Calculate abandonment rate
  const totalSessions = await db.orderSession.count({
    where: {
      shopId: shopData.id,
      startedAt: { gte: thirtyDaysAgo },
    },
  });

  const abandonmentRate =
    totalSessions > 0 ? ((totalAbandoned / totalSessions) * 100).toFixed(1) : 0;

  // Get recent abandoned carts
  const recentAbandoned = await db.abandonedCart.findMany({
    where: {
      shopId: shopData.id,
    },
    orderBy: {
      abandonedAt: "desc",
    },
    take: 10,
  });

  return {
    stats: {
      totalAbandoned,
      recoveredCarts,
      totalOrders,
      totalAbandonedValue,
      abandonmentRate,
      totalSessions,
    },
    recentAbandoned,
  };
};

export default function AnalyticsPage() {
  const { stats, recentAbandoned } = useLoaderData();

  return (
    <div style={{ padding: "20px" }}>
      <s-heading>Abandoned Cart Analytics</s-heading>
      <s-paragraph tone="subdued">
        Track abandoned checkouts and recover lost revenue (Last 30 days)
      </s-paragraph>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        {/* Total Abandoned */}
        <s-card>
          <div style={{ padding: "16px" }}>
            <s-text variant="body-sm" tone="subdued">
              Total Abandoned Carts
            </s-text>
            <s-text
              variant="heading-lg"
              style={{ display: "block", marginTop: "8px" }}
            >
              {stats.totalAbandoned}
            </s-text>
          </div>
        </s-card>

        {/* Abandonment Rate */}
        <s-card>
          <div style={{ padding: "16px" }}>
            <s-text variant="body-sm" tone="subdued">
              Abandonment Rate
            </s-text>
            <s-text
              variant="heading-lg"
              style={{ display: "block", marginTop: "8px" }}
            >
              {stats.abandonmentRate}%
            </s-text>
            <s-text variant="body-xs" tone="subdued">
              {stats.totalSessions} total sessions
            </s-text>
          </div>
        </s-card>

        {/* Total Value */}
        <s-card>
          <div style={{ padding: "16px" }}>
            <s-text variant="body-sm" tone="subdued">
              Total Abandoned Value
            </s-text>
            <s-text
              variant="heading-lg"
              style={{ display: "block", marginTop: "8px" }}
            >
              Rs.{stats.totalAbandonedValue.toFixed(2)}
            </s-text>
          </div>
        </s-card>

        {/* Recovered */}
        <s-card>
          <div style={{ padding: "16px" }}>
            <s-text variant="body-sm" tone="subdued">
              Recovered Carts
            </s-text>
            <s-text
              variant="heading-lg"
              style={{ display: "block", marginTop: "8px" }}
            >
              {stats.recoveredCarts}
            </s-text>
          </div>
        </s-card>
      </div>

      {/* Recent Abandoned Carts Table */}
      <s-section style={{ marginTop: "32px" }}>
        <s-heading>Recent Abandoned Carts</s-heading>

        {recentAbandoned.length === 0 ? (
          <s-box padding="large" style={{ textAlign: "center" }}>
            <s-text tone="subdued">No abandoned carts yet</s-text>
          </s-box>
        ) : (
          <div style={{ marginTop: "16px", overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Customer
                  </th>
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Contact
                  </th>
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Amount
                  </th>
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Abandoned At
                  </th>
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Status
                  </th>
                  <th style={{ padding: "12px", fontWeight: "600" }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentAbandoned.map((cart) => (
                  <tr
                    key={cart.id}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "12px" }}>
                      {cart.customerFirstName || cart.customerLastName
                        ? `${cart.customerFirstName || ""} ${
                            cart.customerLastName || ""
                          }`.trim()
                        : "—"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {cart.customerEmail || cart.customerPhone || "—"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      Rs.{cart.totalAmount.toFixed(2)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {new Date(cart.abandonedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {cart.recovered ? (
                        <span
                          style={{
                            color: "#10b981",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            backgroundColor: "#d1fae5",
                            fontSize: "12px",
                            fontWeight: "500",
                          }}
                        >
                          Recovered
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "#f59e0b",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            backgroundColor: "#fef3c7",
                            fontSize: "12px",
                            fontWeight: "500",
                          }}
                        >
                          Abandoned
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {cart.draftOrderUrl ? (
                        <a
                          href={cart.draftOrderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#3b82f6",
                            textDecoration: "underline",
                          }}
                        >
                          View Draft Order
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* Info Box */}
      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
        background="subdued"
        style={{ marginTop: "24px" }}
      >
        <s-text variant="body-sm">
          ℹ️ <strong>How it works:</strong> When a customer starts filling the
          checkout form but doesn't complete it within 15 minutes, it's marked
          as abandoned. Draft orders are automatically created in Shopify with
          the tag <code>abandoned_checkout_preventify_cod_form</code> for easy
          recovery.
        </s-text>
      </s-box>
    </div>
  );
}
