import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Open in Growzar" (D-10). The merchant types nothing: the server mints a
 * claim token from their verified Shopify session, and Growzar takes it from
 * the URL fragment.
 *
 * Growzar has to open top-level, not inside the admin iframe, so this opens a
 * new tab. Browsers only allow that during the click itself, and the token
 * arrives after an await, so the tab is opened blank first and pointed at
 * Growzar once the token is back. If the browser blocked it anyway, a plain
 * link is shown instead — clicking it is a fresh gesture.
 *
 * Deliberately in the page body, not the page's primary-action slot: App
 * Bridge re-renders slotted actions in the admin's own title bar and forwards
 * the click, which is not a user gesture as far as window.open is concerned.
 */
export default function OpenInGrowzarButton() {
  const [state, setState] = useState({ status: "idle" });
  const buttonRef = useRef(null);

  const open = useCallback(async () => {
    const tab = window.open("about:blank", "_blank");
    setState({ status: "loading" });

    try {
      // App Bridge's fetch adds the session token the server verifies.
      const response = await fetch("/app/growzar-claim", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) {
        throw new Error(body.error || "Could not open Growzar. Try again.");
      }

      if (tab && !tab.closed) {
        tab.opener = null;
        tab.location.href = body.url;
        setState({ status: "idle" });
      } else {
        setState({ status: "blocked", url: body.url });
      }
    } catch (error) {
      if (tab && !tab.closed) tab.close();
      setState({ status: "error", message: error.message });
    }
  }, []);

  // s-button is a web component; listeners are attached directly, as
  // elsewhere in this app.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;
    button.addEventListener("click", open);
    return () => button.removeEventListener("click", open);
  }, [open]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <s-button ref={buttonRef} {...(state.status === "loading" ? { loading: true } : {})}>
        Open in Growzar
      </s-button>
      {state.status === "blocked" && (
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setState({ status: "idle" })}
        >
          Your browser blocked the new tab — continue to Growzar
        </a>
      )}
      {state.status === "error" && (
        <s-text tone="critical">{state.message}</s-text>
      )}
    </div>
  );
}
