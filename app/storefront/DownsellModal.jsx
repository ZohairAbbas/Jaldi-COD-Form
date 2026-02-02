import React from "react";

export default function DownsellModal({
  downsellConfig,
  cartTotal,
  onAccept,
  onDecline,
  isRTL = false,
  currencySymbol = 'Rs.',
}) {
  if (!downsellConfig) {
    return null;
  }

  const { discount, customization } = downsellConfig;

  // Calculate discount amount
  const getDiscountAmount = () => {
    if (discount.type === "percentage") {
      return cartTotal * (discount.value / 100);
    }
    return Math.min(discount.value, cartTotal);
  };

  // Get discount display text
  const getDiscountDisplay = () => {
    if (discount.type === "percentage") {
      return `${discount.value}%`;
    }
    return `${currencySymbol}${discount.value}`;
  };

  // Replace {discount} in button text
  const getButtonText = () => {
    return customization.acceptButtonText.replace("{discount}", getDiscountDisplay());
  };

  // Get button animation class
  const getAnimationStyle = () => {
    switch (customization.acceptButtonAnimation) {
      case "pulse":
        return "jaldi-downsell-pulse";
      case "shake":
        return "jaldi-downsell-shake";
      case "bounce":
        return "jaldi-downsell-bounce";
      default:
        return "";
    }
  };

  return (
    <div
      className="jaldi-downsell-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(55, 65, 81, 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483647,
        padding: "16px",
        direction: isRTL ? "rtl" : "ltr",
      }}
    >
      <div
        className="jaldi-downsell-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "380px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          animation: "jaldi-downsell-slide-up 0.3s ease-out",
        }}
      >
        {/* Title */}
        <h2
          style={{
            fontSize: `${customization.titleFontSize}px`,
            fontWeight: "600",
            marginBottom: "8px",
            color: customization.titleColor,
            lineHeight: "1.3",
          }}
        >
          {customization.title}
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: `${customization.subtitleFontSize}px`,
            marginBottom: "24px",
            color: customization.subtitleColor,
          }}
        >
          {customization.subtitle}
        </p>

        {/* Plaque Text */}
        <p
          style={{
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            color: customization.plaqueTextColor,
          }}
        >
          {customization.plaqueText}
        </p>

        {/* Discount Plaque (Starburst) */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: `${customization.plaqueSize * 2}px`,
              height: `${customization.plaqueSize * 2}px`,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Starburst background */}
            <div
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                background: customization.plaqueBackgroundColor,
                clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
              }}
            />
            <span
              style={{
                fontSize: `${Math.max(18, customization.plaqueSize * 0.6)}px`,
                fontWeight: "700",
                color: customization.plaqueDiscountColor,
                position: "relative",
                zIndex: 1,
              }}
            >
              {getDiscountDisplay()}
            </span>
          </div>
        </div>

        {/* CTA Text */}
        <p
          style={{
            fontSize: "14px",
            marginBottom: "20px",
            color: customization.ctaTextColor,
          }}
        >
          {customization.ctaText}
        </p>

        {/* Accept Button */}
        <button
          onClick={onAccept}
          className={getAnimationStyle()}
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: `${customization.acceptButtonRadius}px`,
            border: customization.acceptButtonBorderWidth > 0
              ? `${customization.acceptButtonBorderWidth}px solid ${customization.acceptButtonBorderColor}`
              : "none",
            background: customization.acceptButtonBgColor,
            color: customization.acceptButtonTextColor,
            fontSize: `${customization.acceptButtonFontSize}px`,
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "12px",
            boxShadow: customization.acceptButtonShadow > 0
              ? `0 ${customization.acceptButtonShadow}px ${customization.acceptButtonShadow * 2}px rgba(0,0,0,0.2)`
              : "none",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
          onMouseOver={(e) => (e.target.style.opacity = "0.9")}
          onMouseOut={(e) => (e.target.style.opacity = "1")}
        >
          {getButtonText()}
        </button>

        {/* Decline Button */}
        <button
          onClick={onDecline}
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: `${customization.declineButtonRadius}px`,
            border: `${customization.declineButtonBorderWidth}px solid ${customization.declineButtonBorderColor}`,
            backgroundColor: customization.declineButtonBgColor,
            color: customization.declineButtonTextColor,
            fontSize: `${customization.declineButtonFontSize}px`,
            fontWeight: "500",
            cursor: "pointer",
            boxShadow: customization.declineButtonShadow > 0
              ? `0 ${customization.declineButtonShadow}px ${customization.declineButtonShadow * 2}px rgba(0,0,0,0.1)`
              : "none",
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
          @keyframes jaldi-downsell-slide-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes jaldi-downsell-pulse {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
          }

          @keyframes jaldi-downsell-shake {
            0%, 100% {
              transform: translateX(0);
            }
            10%, 30%, 50%, 70%, 90% {
              transform: translateX(-2px);
            }
            20%, 40%, 60%, 80% {
              transform: translateX(2px);
            }
          }

          @keyframes jaldi-downsell-bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-5px);
            }
          }

          .jaldi-downsell-pulse {
            animation: jaldi-downsell-pulse 2s infinite;
          }

          .jaldi-downsell-shake {
            animation: jaldi-downsell-shake 0.5s infinite;
          }

          .jaldi-downsell-bounce {
            animation: jaldi-downsell-bounce 1s infinite;
          }
        `}
      </style>
    </div>
  );
}
