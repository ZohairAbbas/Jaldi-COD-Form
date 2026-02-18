import React from "react";

export default function UpsellModal({
  upsellConfig,
  onAccept,
  onDecline,
  isRTL = false,
  isPostPurchase = false,
  currencySymbol = 'Rs.',
  exchangeRate = null,
}) {
  if (!upsellConfig || !upsellConfig.product) {
    return null;
  }

  const { product, discount, customization } = upsellConfig;

  // Convert price for display if exchange rate is available
  const toDisplay = (price) => exchangeRate ? parseFloat((price * exchangeRate).toFixed(2)) : price;

  // Calculate discounted price (in original currency)
  const getDiscountedPrice = () => {
    if (!product.price) return null;
    if (discount.type === "none" || !discount.value) return product.price;

    if (discount.type === "fixed") {
      return Math.max(0, product.price - discount.value);
    } else if (discount.type === "percentage") {
      return product.price * (1 - discount.value / 100);
    }
    return product.price;
  };

  const discountedPrice = getDiscountedPrice();
  const hasDiscount = discount.type !== "none" && discount.value > 0;

  // Replace {product_name} in modal title
  const modalTitle = customization.modalTitle.replace(
    "{product_name}",
    product.title || "Product"
  );

  // Format price with currency
  const formatPrice = (price) => {
    return `${currencySymbol}${price?.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div
      className="jaldi-upsell-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483647,
        padding: "16px",
        direction: isRTL ? "rtl" : "ltr",
      }}
    >
      <div
        className="jaldi-upsell-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "420px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          animation: "jaldi-upsell-slide-up 0.3s ease-out",
        }}
      >
        {/* Title */}
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "600",
            marginBottom: "20px",
            color: "#000000",
            lineHeight: "1.3",
          }}
        >
          {modalTitle}
        </h2>

        {/* Product Image */}
        {product.image && (
          <div
            style={{
              marginBottom: "16px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src={product.image}
              alt={product.title}
              style={{
                maxWidth: "200px",
                maxHeight: "200px",
                objectFit: "contain",
                borderRadius: "8px",
              }}
            />
          </div>
        )}

        {/* Product Title */}
        <p
          style={{
            fontSize: "16px",
            fontWeight: "500",
            marginBottom: "8px",
            color: "#000000",
          }}
        >
          {product.title}
        </p>

        {/* Price */}
        <div style={{ marginBottom: "24px" }}>
          {hasDiscount ? (
            <div>
              <span
                style={{
                  textDecoration: "line-through",
                  color: "#6b7280",
                  marginRight: isRTL ? "0" : "8px",
                  marginLeft: isRTL ? "8px" : "0",
                  fontSize: "16px",
                }}
              >
                {formatPrice(toDisplay(product.price))}
              </span>
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: "700",
                  color: "#000000",
                }}
              >
                {formatPrice(toDisplay(discountedPrice))}
              </span>
              {/* Discount badge */}
              <div
                style={{
                  display: "inline-block",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "600",
                  marginLeft: isRTL ? "0" : "8px",
                  marginRight: isRTL ? "8px" : "0",
                }}
              >
                {discount.type === "percentage"
                  ? `${discount.value}% OFF`
                  : `Save ${currencySymbol}${toDisplay(discount.value)}`}
              </div>
            </div>
          ) : (
            <span
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#000000",
              }}
            >
              {formatPrice(toDisplay(product.price))}
            </span>
          )}
        </div>

        {/* Accept Button */}
        <button
          onClick={onAccept}
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: customization.acceptButtonBgColor,
            color: customization.acceptButtonTextColor,
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "12px",
            transition: "opacity 0.2s ease",
          }}
          onMouseOver={(e) => (e.target.style.opacity = "0.9")}
          onMouseOut={(e) => (e.target.style.opacity = "1")}
        >
          {customization.acceptButtonText}
        </button>

        {/* Decline Button */}
        <button
          onClick={onDecline}
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: "8px",
            border: `1px solid ${customization.declineButtonTextColor}`,
            backgroundColor: customization.declineButtonBgColor,
            color: customization.declineButtonTextColor,
            fontSize: "16px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "opacity 0.2s ease",
          }}
          onMouseOver={(e) => (e.target.style.opacity = "0.8")}
          onMouseOut={(e) => (e.target.style.opacity = "1")}
        >
          {customization.declineButtonText}
        </button>
      </div>

      {/* Animation styles */}
      <style>
        {`
          @keyframes jaldi-upsell-slide-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}
