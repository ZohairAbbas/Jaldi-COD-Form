import { useState, useRef, useEffect } from "react";
import { COUNTRY_OPTIONS } from "../lib/constants";

/**
 * Per-offer country targeting picker, shared by the one-click, one-tick and
 * downsell editors so the three copies can't drift.
 *
 * Semantics match `nativeBundleCountries` (NOT the COD form's `allowedCountries`):
 * "all" — or "specific" with an empty list — means the offer shows everywhere.
 * The visitor's country is IP-detected on the storefront; it is not the country
 * selected in the COD form's dropdown.
 *
 * @param {string}   countryTargeting  "all" | "specific"
 * @param {string[]} targetCountries   internal codes, e.g. ["PAK","ARE"]
 * @param {Function} onChange          receives a partial update to merge, e.g.
 *                                     { countryTargeting } or { targetCountries }
 * @param {string}   label             heading text ("Show the upsell for:")
 * @param {string}   offerNoun         used in help copy ("upsell" | "downsell")
 */
export default function CountryTargetingPicker({
  countryTargeting = "all",
  targetCountries = [],
  onChange,
  label = "Show the offer for:",
  offerNoun = "offer",
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  const selected = Array.isArray(targetCountries) ? targetCountries : [];
  const isSpecific = countryTargeting === "specific";

  // Close the dropdown when clicking outside, matching app.settings.jsx
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const matches = COUNTRY_OPTIONS.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) &&
      !selected.includes(c.value)
  );

  return (
    <s-stack direction="block" gap="tight">
      <s-text variant="heading-sm">{label}</s-text>

      <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
        <input
          type="radio"
          name={`countryTargeting-${label}`}
          checked={!isSpecific}
          onChange={() => onChange({ countryTargeting: "all" })}
          style={{ width: "16px", height: "16px", cursor: "pointer" }}
        />
        <s-text variant="body-md">All countries</s-text>
      </label>

      <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
        <input
          type="radio"
          name={`countryTargeting-${label}`}
          checked={isSpecific}
          onChange={() => onChange({ countryTargeting: "specific" })}
          style={{ width: "16px", height: "16px", cursor: "pointer" }}
        />
        <s-text variant="body-md">Specific countries</s-text>
      </label>

      {isSpecific && (
        <>
          <s-text variant="body-sm" tone="subdued">
            The visitor&apos;s country is detected by IP. If it can&apos;t be determined,
            the {offerNoun} is shown.
          </s-text>

          <div style={{ position: "relative" }} ref={searchRef}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search countries (leave empty for all)"
              style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
            />
            {showDropdown && (
              <div
                style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "6px",
                  marginTop: "4px", maxHeight: "200px", overflowY: "auto", zIndex: 100,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                {matches.map((country) => (
                  <div
                    key={country.value}
                    onClick={() => {
                      onChange({ targetCountries: [...selected, country.value] });
                      setSearch("");
                      setShowDropdown(false);
                    }}
                    style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                    onMouseEnter={(e) => (e.target.style.backgroundColor = "#f5f5f5")}
                    onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
                  >
                    {country.label}
                  </div>
                ))}
                {matches.length === 0 && (
                  <div style={{ padding: "10px 12px", color: "#999" }}>No countries found</div>
                )}
              </div>
            )}
          </div>

          {selected.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {selected.map((code) => {
                const country = COUNTRY_OPTIONS.find((c) => c.value === code);
                return (
                  <div key={code} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", backgroundColor: "#f5f5f5", borderRadius: "20px", fontSize: "14px" }}>
                    <span>{country?.label || code}</span>
                    <button
                      onClick={() => onChange({ targetCountries: selected.filter((c) => c !== code) })}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6b7280", fontSize: "16px", lineHeight: 1, padding: 0 }}
                      aria-label={`Remove ${country?.label || code}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                No countries selected — this {offerNoun} shows in all countries.
              </s-text>
            </s-box>
          )}
        </>
      )}
    </s-stack>
  );
}
