import { useState, useEffect, useCallback } from "react";

/**
 * Google Sheets integration settings tab.
 *
 * Renders the connect / disconnect flow plus, once connected, the spreadsheet &
 * tab pickers, order-type filter, abandoned-orders option, and the A..Z column
 * mapping grid. All reads/writes go through /api/google-sheets.
 *
 * Props:
 *   initialIntegration: sanitized integration row (or null) from the settings loader
 *   fieldCatalog: FIELD_CATALOG from google-sheets.server (id/label/hasValue)
 *   columnPresets: COLUMN_PRESETS map { standard: [...fieldIds], detailed: [...] }
 */
export default function GoogleSheetsIntegration({
  initialIntegration,
  fieldCatalog,
  columnPresets,
}) {
  const [integration, setIntegration] = useState(initialIntegration);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [abandonedTabs, setAbandonedTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const connected = Boolean(integration?.connected);

  // Local editable config mirrors the integration row.
  const [config, setConfig] = useState(() => deriveConfig(initialIntegration));

  useEffect(() => {
    setConfig(deriveConfig(integration));
  }, [integration?.id]);

  const api = useCallback(async (payload) => {
    const res = await fetch("/api/google-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }, []);

  const refreshIntegration = useCallback(async () => {
    const res = await fetch("/api/google-sheets");
    const data = await res.json();
    if (data.integration) setIntegration(data.integration);
  }, []);

  // Refresh after the OAuth popup signals completion.
  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type === "google-sheets-connected") {
        refreshIntegration();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshIntegration]);

  const handleConnect = async () => {
    // Open the popup synchronously (so it isn't blocked), then navigate it to the
    // Google consent URL we fetch from the authenticated API. We can't open
    // /api/google/connect directly because a fresh popup has no embedded admin
    // session and Shopify would bounce it to /auth/login.
    const popup = window.open("about:blank", "_blank", "width=520,height=640");
    const data = await api({ intent: "getAuthUrl" });
    if (data.success && data.authUrl) {
      if (popup) popup.location.href = data.authUrl;
      else window.location.href = data.authUrl; // popup blocked → fall back to full redirect
    } else {
      if (popup) popup.close();
      setMessage(data.error || "Could not start Google sign-in");
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Google account? Orders will stop syncing.")) return;
    setLoading(true);
    await api({ intent: "disconnect" });
    setIntegration(null);
    setSpreadsheets([]);
    setTabs([]);
    setLoading(false);
  };

  const loadSpreadsheets = useCallback(async () => {
    setLoading(true);
    const data = await api({ intent: "listSpreadsheets" });
    if (data.success) setSpreadsheets(data.spreadsheets);
    else setMessage(data.error);
    setLoading(false);
  }, [api]);

  const loadTabs = useCallback(
    async (spreadsheetId, target = "orders") => {
      if (!spreadsheetId) return;
      const data = await api({ intent: "listTabs", spreadsheetId });
      if (data.success) {
        if (target === "orders") setTabs(data.tabs);
        else setAbandonedTabs(data.tabs);
      }
    },
    [api]
  );

  // When connected, load the spreadsheet list once.
  useEffect(() => {
    if (connected) loadSpreadsheets();
  }, [connected, loadSpreadsheets]);

  // When a spreadsheet is selected, load its tabs.
  useEffect(() => {
    if (connected && config.spreadsheetId) {
      loadTabs(config.spreadsheetId, "orders");
      loadTabs(config.spreadsheetId, "abandoned");
    }
  }, [connected, config.spreadsheetId, loadTabs]);

  const handleCreateSpreadsheet = async () => {
    const title = prompt("Name for the new spreadsheet:", "Preventify COD Orders");
    if (!title) return;
    setLoading(true);
    const data = await api({ intent: "createSpreadsheet", title });
    if (data.success) {
      await loadSpreadsheets();
      setConfig((c) => ({
        ...c,
        spreadsheetId: data.spreadsheet.id,
        spreadsheetName: data.spreadsheet.name,
      }));
    } else {
      setMessage(data.error);
    }
    setLoading(false);
  };

  const saveConfig = async (overrides = {}) => {
    const merged = { ...config, ...overrides };

    // Auto-enable on save when the config is complete (spreadsheet + tab + at
    // least one mapped field). Configuring the integration is effectively opting
    // in — this avoids the "saved but nothing syncs" footgun. The merchant can
    // still explicitly turn it off via the toggle.
    if (!merged.enabled && isConfigComplete(merged)) {
      merged.enabled = true;
    }

    setLoading(true);
    const data = await api({ intent: "saveConfig", ...merged });
    if (data.success) {
      setIntegration(data.integration);
      setConfig((c) => ({ ...c, enabled: merged.enabled }));
      setMessage("Saved");
      setTimeout(() => setMessage(null), 2000);
    } else {
      setMessage(data.error);
    }
    setLoading(false);
  };

  const updateConfig = (patch) => setConfig((c) => ({ ...c, ...patch }));

  // ---- Column mapping helpers ----
  const setColumn = (index, patch) => {
    setConfig((c) => {
      const mapping = [...c.columnMapping];
      mapping[index] = { ...mapping[index], ...patch };
      return { ...c, columnMapping: mapping };
    });
  };
  const addColumn = () =>
    setConfig((c) => ({
      ...c,
      columnMapping: [...c.columnMapping, { col: nextCol(c.columnMapping.length), field: "empty" }],
    }));
  const removeColumn = (index) =>
    setConfig((c) => ({
      ...c,
      columnMapping: c.columnMapping.filter((_, i) => i !== index),
    }));
  const applyPreset = (presetKey) => {
    if (presetKey === "custom") return;
    const fields = columnPresets[presetKey] || [];
    updateConfig({
      columnMapping: fields.map((field, i) => ({ col: nextCol(i), field })),
    });
  };

  // ================= RENDER =================
  if (!connected) {
    return (
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Google Sheets</s-heading>
          <s-paragraph>
            Import your COD form orders automatically into a Google Sheet. Sign in with your
            Google account to get started.
          </s-paragraph>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={handleConnect} style={primaryBtn}>
              Sign in with Google
            </button>
          </div>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text variant="body-sm">
              When you sign in, make sure to allow access to your Google Drive files and Google
              Sheets so we can import your orders.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <s-heading>Google Sheets</s-heading>
          <button onClick={handleDisconnect} style={dangerBtn} disabled={loading}>
            Disconnect Google account
          </button>
        </div>
        <s-text variant="body-sm">
          Connected as <strong>{integration.googleEmail || "your Google account"}</strong>
        </s-text>

        {/* Sync status banner — reflects the last SAVED state, not unsaved edits. */}
        <div style={statusBanner(integration)}>
          {integration.lastSyncError
            ? `⚠️ Last sync failed: ${integration.lastSyncError}`
            : integration.enabled
            ? `✅ Syncing is active${
                integration.lastSyncedAt
                  ? ` — last synced ${formatRelative(integration.lastSyncedAt)}`
                  : " — waiting for the first sync"
              }`
            : "⚠️ Import is disabled — turn on “Enable automatic import” and Save to start syncing orders to your sheet."}
        </div>

        {/* 1. Spreadsheet + tab selection */}
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text variant="heading-sm">1. Select the Google Sheet where your orders will be imported</s-text>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => updateConfig({ enabled: e.target.checked })}
              />
              <span>Enable automatic import of your orders on Google Sheets</span>
            </label>

            <div>
              <div style={fieldLabel}>Select your spreadsheet</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={config.spreadsheetId || ""}
                  onChange={(e) => {
                    const ss = spreadsheets.find((s) => s.id === e.target.value);
                    updateConfig({ spreadsheetId: e.target.value, spreadsheetName: ss?.name || "" });
                  }}
                  style={selectStyle}
                >
                  <option value="">Select your spreadsheet</option>
                  {spreadsheets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button onClick={loadSpreadsheets} style={secondaryBtn} disabled={loading}>Refresh</button>
                <button onClick={handleCreateSpreadsheet} style={secondaryBtn} disabled={loading}>+ Create new</button>
              </div>
            </div>

            <div>
              <div style={fieldLabel}>Select your sheet</div>
              <select
                value={config.ordersSheetName || "ALL"}
                onChange={(e) => updateConfig({ ordersSheetName: e.target.value })}
                style={selectStyle}
                disabled={!config.spreadsheetId}
              >
                <option value="ALL">ALL</option>
                {tabs.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={config.importAbandonedSeparate}
                onChange={(e) => updateConfig({ importAbandonedSeparate: e.target.checked })}
              />
              <span>Import abandoned orders on a separate sheet</span>
            </label>

            {config.importAbandonedSeparate && (
              <div>
                <div style={fieldLabel}>Abandoned orders sheet</div>
                <select
                  value={config.abandonedSheetName || ""}
                  onChange={(e) => updateConfig({ abandonedSheetName: e.target.value })}
                  style={selectStyle}
                  disabled={!config.spreadsheetId}
                >
                  <option value="">Select your sheet</option>
                  {abandonedTabs.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <div style={fieldLabel}>Select which types of orders to import</div>
              <select
                value={config.orderTypeFilter}
                onChange={(e) => updateConfig({ orderTypeFilter: e.target.value })}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="normal">Only normal orders</option>
                <option value="abandoned">Only abandoned orders</option>
                <option value="both">Both normal and abandoned orders</option>
              </select>
            </div>

            <label style={checkRow}>
              <input
                type="checkbox"
                checked={config.oneProductPerLine}
                onChange={(e) => updateConfig({ oneProductPerLine: e.target.checked })}
              />
              <span>Import orders with different products on multiple lines</span>
            </label>

            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">Only new orders will be imported on your Google Sheets file.</s-text>
            </s-box>
          </s-stack>
        </s-box>

        {/* 2. Column mapping */}
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text variant="heading-sm">2. Configure your column fields</s-text>

            <div>
              <div style={fieldLabel}>Import presets</div>
              <select
                onChange={(e) => applyPreset(e.target.value)}
                style={selectStyle}
                defaultValue="custom"
              >
                <option value="custom">Custom</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {config.columnMapping.map((col, i) => (
                      <th key={i} style={colHeader}>{col.col || colLetter(i)}</th>
                    ))}
                    <th style={colHeader}></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {config.columnMapping.map((col, i) => (
                      <td key={i} style={colCell}>
                        <select
                          value={col.field || "empty"}
                          onChange={(e) => setColumn(i, { field: e.target.value })}
                          style={{ ...selectStyle, width: "160px" }}
                        >
                          {fieldCatalog.map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                        {col.field === "custom_text" && (
                          <input
                            type="text"
                            value={col.value || ""}
                            placeholder="Custom text"
                            onChange={(e) => setColumn(i, { value: e.target.value })}
                            style={{ ...inputStyle, width: "160px", marginTop: "6px" }}
                          />
                        )}
                        <button onClick={() => removeColumn(i)} style={removeBtn}>Remove</button>
                      </td>
                    ))}
                    <td style={colCell}>
                      <button onClick={addColumn} style={secondaryBtn}>+ Column</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </s-stack>
        </s-box>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={() => saveConfig()} style={primaryBtn} disabled={loading}>
            {loading ? "Saving..." : "Save Google Sheets settings"}
          </button>
          {message && <s-text variant="body-sm">{message}</s-text>}
        </div>
      </s-stack>
    </s-section>
  );
}

// ---- helpers ----
function deriveConfig(integration) {
  return {
    enabled: integration?.enabled ?? false,
    spreadsheetId: integration?.spreadsheetId ?? "",
    spreadsheetName: integration?.spreadsheetName ?? "",
    ordersSheetName: integration?.ordersSheetName ?? "ALL",
    abandonedSheetName: integration?.abandonedSheetName ?? "",
    importAbandonedSeparate: integration?.importAbandonedSeparate ?? false,
    orderTypeFilter: integration?.orderTypeFilter ?? "normal",
    oneProductPerLine: integration?.oneProductPerLine ?? false,
    columnMapping: Array.isArray(integration?.columnMapping) ? integration.columnMapping : [],
  };
}

// Config is "complete" (safe to auto-enable) when there's a destination sheet
// and at least one mapped field. If abandoned orders go on a separate sheet,
// that tab must be chosen too.
function isConfigComplete(cfg) {
  if (!cfg.spreadsheetId) return false;
  if (!cfg.ordersSheetName) return false;
  const hasMapping =
    Array.isArray(cfg.columnMapping) &&
    cfg.columnMapping.some((c) => c.field && c.field !== "empty");
  if (!hasMapping) return false;
  if (cfg.importAbandonedSeparate && !cfg.abandonedSheetName) return false;
  return true;
}

function formatRelative(dateStr) {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function colLetter(i) {
  return String.fromCharCode(65 + (i % 26));
}
function nextCol(i) {
  return colLetter(i);
}

// ---- styles ----
function statusBanner(integration) {
  const ok = integration.enabled && !integration.lastSyncError;
  const error = Boolean(integration.lastSyncError);
  const bg = error ? "#fef2f2" : ok ? "#f0fdf4" : "#fffbeb";
  const border = error ? "#fecaca" : ok ? "#bbf7d0" : "#fde68a";
  const color = error ? "#991b1b" : ok ? "#065f46" : "#92400e";
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
const primaryBtn = {
  padding: "10px 16px",
  backgroundColor: "#000",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "14px",
};
const secondaryBtn = {
  padding: "8px 14px",
  backgroundColor: "#f3f4f6",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "13px",
};
const dangerBtn = {
  padding: "8px 14px",
  backgroundColor: "#dc2626",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "13px",
};
const removeBtn = {
  display: "block",
  marginTop: "6px",
  padding: "2px 8px",
  backgroundColor: "transparent",
  border: "none",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: "12px",
};
const selectStyle = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "14px",
  backgroundColor: "#fff",
};
const inputStyle = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "14px",
};
const fieldLabel = { fontSize: "13px", fontWeight: 500, marginBottom: "6px" };
const checkRow = { display: "flex", gap: "8px", alignItems: "center", fontSize: "14px", cursor: "pointer" };
const colHeader = {
  border: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 600,
  textAlign: "center",
  minWidth: "160px",
};
const colCell = { border: "1px solid #e5e7eb", padding: "10px", verticalAlign: "top" };
