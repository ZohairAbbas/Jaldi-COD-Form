import { useState, useEffect } from "react";

// Swatch picker + free-text hex box so a store owner can paste their exact
// brand colour instead of hunting for it in the OS colour picker. Shared by
// the quantity-break and combo editors.
export function normalizeHex(raw) {
  let v = String(raw || "").trim();
  if (!v) return null;
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export default function HexColorField({ value, onChange }) {
  const current = normalizeHex(value) || "#000000";
  const [draft, setDraft] = useState(current);
  const [invalid, setInvalid] = useState(false);

  // Keep the text box in sync when the value changes elsewhere (palette click).
  useEffect(() => {
    setDraft(current);
    setInvalid(false);
  }, [current]);

  const commit = (raw) => {
    const hex = normalizeHex(raw);
    if (hex) {
      setDraft(hex);
      setInvalid(false);
      onChange(hex);
    } else {
      // Invalid entry: flag it and fall back to the last good value.
      setInvalid(true);
      setDraft(current);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input
        type="color"
        value={current}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        style={{ width: "32px", height: "32px", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer", padding: "0" }}
      />
      <input
        type="text"
        value={draft}
        spellCheck={false}
        maxLength={7}
        placeholder="#000000"
        aria-label="Hex colour"
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
        style={{
          width: "80px", padding: "4px 6px", borderRadius: "4px",
          border: `1px solid ${invalid ? "#DC2626" : "#d1d5db"}`,
          fontSize: "13px", fontFamily: "monospace", textTransform: "lowercase",
        }}
      />
    </div>
  );
}
