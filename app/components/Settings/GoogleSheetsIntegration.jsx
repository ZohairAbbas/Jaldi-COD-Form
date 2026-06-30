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

  const handleConnect = () => {
    window.open("/api/google/connect", "_blank", "width=520,height=640");
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
    setLoading(true);
    const data = await api({ intent: "saveConfig", ...merged });
    if (data.success) {
      setIntegration(data.integration);
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

function colLetter(i) {
  return String.fromCharCode(65 + (i % 26));
}
function nextCol(i) {
  return colLetter(i);
}

// ---- styles ----
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
