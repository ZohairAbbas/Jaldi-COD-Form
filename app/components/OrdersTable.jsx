import { useState } from "react";
import { useNavigate, useSubmit } from "react-router";

export default function OrdersTable({ orders, pagination, filters }) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [selectedStatus, setSelectedStatus] = useState(filters.status || "all");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (selectedStatus && selectedStatus !== "all")
      params.set("status", selectedStatus);
    navigate(`?${params.toString()}`);
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: newStatus }),
      });

      if (response.ok) {
        // Reload the page to show updated data
        navigate(".", { replace: true });
      }
    } catch (error) {
      console.error("Failed to update order status:", error);
    }
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", newPage.toString());
    navigate(`?${params.toString()}`);
  };

  const getStatusTone = (status) => {
    switch (status) {
      case "confirmed":
        return "success";
      case "cancelled":
        return "critical";
      case "pending":
        return "attention";
      default:
        return "info";
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      {/* Search and Filter */}
      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
        background="subdued"
      >
        <form onSubmit={handleSearch}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-box style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search by name, phone, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                />
              </s-box>

              <s-box>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    const params = new URLSearchParams();
                    if (searchTerm) params.set("search", searchTerm);
                    if (e.target.value !== "all")
                      params.set("status", e.target.value);
                    navigate(`?${params.toString()}`);
                  }}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </s-box>

              <s-button type="submit">Search</s-button>
            </s-stack>
          </s-stack>
        </form>
      </s-box>

      {/* Stats */}
      <s-stack direction="inline" gap="base">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
          style={{ flex: 1 }}
        >
          <s-stack direction="block" gap="small">
            <s-text variant="body-sm">Total Orders</s-text>
            <s-text variant="heading-xl">{pagination.total}</s-text>
          </s-stack>
        </s-box>
      </s-stack>

      {/* Orders Table */}
      {orders.length === 0 ? (
        <s-box
          padding="large"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base" align="center">
            <s-heading>No orders found</s-heading>
            <s-paragraph>
              {searchTerm || selectedStatus !== "all"
                ? "Try adjusting your filters"
                : "Orders placed through your COD form will appear here."}
            </s-paragraph>
          </s-stack>
        </s-box>
      ) : (
        <s-stack direction="block" gap="base">
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: "white",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f7f7f7" }}>
                  <th style={{ padding: "12px", textAlign: "left" }}>
                    Customer
                  </th>
                  <th style={{ padding: "12px", textAlign: "left" }}>
                    Contact
                  </th>
                  <th style={{ padding: "12px", textAlign: "left" }}>
                    Address
                  </th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Status</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Date</th>
                  <th style={{ padding: "12px", textAlign: "center" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr
                    key={order.id}
                    style={{
                      borderTop: index > 0 ? "1px solid #e5e5e5" : "none",
                    }}
                  >
                    <td style={{ padding: "12px" }}>
                      <div>
                        <div style={{ fontWeight: "500" }}>
                          {order.firstName} {order.lastName}
                        </div>
                        {order.shopifyOrderNumber && (
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            Shopify #{order.shopifyOrderNumber}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px", fontSize: "14px" }}>
                      <div>{order.phone}</div>
                      {order.email && (
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {order.email}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", fontSize: "14px" }}>
                      <div>
                        {order.city}, {order.province}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {order.address}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        textAlign: "right",
                        fontWeight: "500",
                      }}
                    >
                      Rs. {order.total.toFixed(2)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <s-badge tone={getStatusTone(order.status)}>
                        {order.status}
                      </s-badge>
                    </td>
                    <td style={{ padding: "12px", fontSize: "14px" }}>
                      {formatDate(order.createdAt)}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          backgroundColor: "white",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="inline" gap="base" align="center">
                <s-button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  Previous
                </s-button>

                <s-text>
                  Page {pagination.page} of {pagination.totalPages}
                </s-text>

                <s-button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                >
                  Next
                </s-button>
              </s-stack>
            </s-box>
          )}
        </s-stack>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          onClick={() => setSelectedOrder(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" align="center">
                <s-heading style={{ flex: 1 }}>Order Details</s-heading>
                <button
                  onClick={() => setSelectedOrder(null)}
                  style={{
                    padding: "8px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "20px",
                  }}
                >
                  ×
                </button>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="heading-sm">Customer Information</s-text>
                <s-text>
                  Name: {selectedOrder.firstName} {selectedOrder.lastName}
                </s-text>
                <s-text>Phone: {selectedOrder.phone}</s-text>
                {selectedOrder.email && (
                  <s-text>Email: {selectedOrder.email}</s-text>
                )}
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="heading-sm">Shipping Address</s-text>
                <s-text>{selectedOrder.address}</s-text>
                {selectedOrder.address2 && <s-text>{selectedOrder.address2}</s-text>}
                <s-text>
                  {selectedOrder.city}, {selectedOrder.province}{" "}
                  {selectedOrder.postalCode}
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="heading-sm">Order Items</s-text>
                {JSON.parse(selectedOrder.items).map((item, i) => (
                  <s-stack
                    key={i}
                    direction="inline"
                    gap="base"
                    align="center"
                  >
                    <s-text style={{ flex: 1 }}>
                      {item.title} {item.variant && `- ${item.variant}`}
                    </s-text>
                    <s-text>×{item.quantity}</s-text>
                    <s-text>Rs. {item.price.toFixed(2)}</s-text>
                  </s-stack>
                ))}
              </s-stack>

              <s-divider />

              <s-stack direction="inline" gap="base" align="center">
                <s-text variant="heading-sm" style={{ flex: 1 }}>
                  Total
                </s-text>
                <s-text variant="heading-sm">
                  Rs. {selectedOrder.total.toFixed(2)}
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="heading-sm">Status</s-text>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => {
                    handleStatusChange(selectedOrder.id, e.target.value);
                    setSelectedOrder(null);
                  }}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </s-stack>

              {selectedOrder.shopifyOrderNumber && (
                <>
                  <s-divider />
                  <s-stack direction="block" gap="small">
                    <s-text variant="heading-sm">Shopify Order</s-text>
                    <s-text>Order #{selectedOrder.shopifyOrderNumber}</s-text>
                  </s-stack>
                </>
              )}

              <s-divider />

              <s-text variant="body-sm" style={{ color: "#666" }}>
                Created: {formatDate(selectedOrder.createdAt)}
              </s-text>
            </s-stack>
          </div>
        </div>
      )}
    </>
  );
}
