export default function FormModeSelector({ settings, onUpdate }) {
  const handleModeChange = (mode) => {
    onUpdate({ formMode: mode });
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form type</s-heading>
      <s-paragraph>
        Choose how your COD form appears on your storefront.
      </s-paragraph>

      {/* Card-style buttons in a row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
        marginTop: '8px',
      }}>
        {/* Popup Mode Card */}
        <div
          onClick={() => handleModeChange("popup")}
          style={{
            border: settings.formMode === "popup" ? '3px solid #000' : '2px solid #E5E7EB',
            borderRadius: '12px',
            padding: '0',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: '#fff',
            overflow: 'hidden',
          }}
        >
          {/* Icon section with background */}
          <div style={{
            backgroundColor: settings.formMode === "popup" ? '#303030' : '#E5E7EB',
            padding: '24px 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'background-color 0.2s ease',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#fff',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Popup icon (list with squares) */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#303030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
          </div>
          {/* Label section */}
          <div style={{
            padding: '16px 24px',
            textAlign: 'center',
            backgroundColor: '#fff',
          }}>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#000',
            }}>
              Pop-up Form
            </div>
          </div>
        </div>

        {/* Embedded Mode Card */}
        <div
          onClick={() => handleModeChange("embedded")}
          style={{
            border: settings.formMode === "embedded" ? '3px solid #000' : '2px solid #E5E7EB',
            borderRadius: '12px',
            padding: '0',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: '#fff',
            overflow: 'hidden',
          }}
        >
          {/* Icon section with background */}
          <div style={{
            backgroundColor: settings.formMode === "embedded" ? '#303030' : '#E5E7EB',
            padding: '24px 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'background-color 0.2s ease',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#fff',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Embedded icon (document with lines) */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#303030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </div>
          </div>
          {/* Label section */}
          <div style={{
            padding: '16px 24px',
            textAlign: 'center',
            backgroundColor: '#fff',
          }}>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#000',
            }}>
              Embedded Form
            </div>
          </div>
        </div>
      </div>

      {/* Description below cards */}
      <s-text variant="body-sm" tone="subdued" style={{ marginTop: '8px' }}>
        {settings.formMode === "popup"
          ? "Form will open when the customer clicks the app's Buy Button."
          : "Form will be embedded directly on the page without a button."}
      </s-text>
    </s-stack>
  );
}
