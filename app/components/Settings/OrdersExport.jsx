import { useState } from "react";

/**
 * One-off CSV download of the shop's orders.
 *
 * Sits beside the Google Sheets integration because they answer the same
 * question — how do I get my orders out of here — by different means: a
 * continuous sync, or a file right now. The columns are shared, so a merchant
 * who has configured their sheet gets the same layout in the download.
 *
 * The request goes through fetch rather than a link or a new tab: inside the
 * embedded admin, App Bridge patches window.fetch to attach the session token,
 * so this authenticates correctly where a plain navigation would bounce to
 * OAuth. The response is turned into a blob and saved through a temporary
 * anchor.
 */
export default function OrdersExport({ columnSource }) {
  const [type, setType] = useState("normal");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({ type });
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/orders/export?${params.toString()}`);

      if (!res.ok) {
        let detail = "Export failed. Please try again.";
        try {
          const body = await res.json();
          if (body?.error) detail = body.error;
        } catch {
          /* non-JSON error body; keep the default */
        }
        setMessage({ tone: "error", text: detail });
        return;
      }

      const rows = Number(res.headers.get("X-Export-Rows") || 0);
      const truncated = res.headers.get("X-Export-Truncated") === "true";

      if (rows === 0) {
        setMessage({
          tone: "warn",
          text: "No orders matched those dates, so there was nothing to export.",
        });
        return;
      }

      const blob = await res.blob();
      const filename =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "preventify-orders.csv";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        tone: "ok",
        text: truncated
          ? `Downloaded the most recent ${rows.toLocaleString()} rows. Narrow the dates to export the rest.`
          : `Downloaded ${rows.toLocaleString()} row${rows === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      console.error("[orders-export]", error);
      setMessage({ tone: "error", text: "Export failed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-heading>Download orders as CSV</s-heading>
        <s-paragraph>
          Export your COD orders to a spreadsheet file. Opens in Excel, Numbers and
          Google Sheets, and can be handed to a courier for bulk booking.
        </s-paragraph>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={fieldLabel}>What to export</div>
            <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
              <option value="normal">Orders</option>
              <option value="abandoned">Abandoned carts</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div>
            <div style={fieldLabel}>From (optional)</div>
            <input type="date" value={from} max={to || undefined}
              onChange={(e) => setFrom(e.target.value)} style={input} />
          </div>

          <div>
            <div style={fieldLabel}>To (optional)</div>
            <input type="date" value={to} min={from || undefined}
              onChange={(e) => setTo(e.target.value)} style={input} />
          </div>

          <button onClick={handleExport} disabled={busy} style={busy ? btnBusy : btn}>
            {busy ? "Preparing…" : "Download CSV"}
          </button>
        </div>

        <s-text variant="body-sm">
          {columnSource === "sheets"
            ? "Columns match the layout you set up for Google Sheets below."
            : "Leave the dates empty to export everything. Set up Google Sheets below to choose your own columns."}
        </s-text>

        {message && (
          <div style={banner(message.tone)}>
            {message.text}
          </div>
        )}
      </s-stack>
    </s-section>
  );
}

const fieldLabel = {
  fontSize: "13px",
  fontWeight: 500,
  color: "#374151",
  marginBottom: "6px",
};

const input = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  backgroundColor: "#ffffff",
  color: "#111827",
  minWidth: "160px",
};

const btn = {
  padding: "9px 18px",
  border: "none",
  borderRadius: "8px",
  backgroundColor: "#111827",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const btnBusy = { ...btn, backgroundColor: "#9ca3af", cursor: "wait" };

function banner(tone) {
  const map = {
    ok: ["#f0fdf4", "#bbf7d0", "#065f46"],
    warn: ["#fffbeb", "#fde68a", "#92400e"],
    error: ["#fef2f2", "#fecaca", "#991b1b"],
  };
  const [bg, border, color] = map[tone] || map.ok;
  return {
    padding: "10px 14px",
    borderRadius: "8px",
    border: `1px solid ${border}`,
    backgroundColor: bg,
    color,
    fontSize: "13px",
    fontWeight: 500,
  };
}
