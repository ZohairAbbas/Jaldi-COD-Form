export default function ErrorPage({ title, subtitle }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Document icon */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        backgroundColor: '#f3f3f3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
      }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="3" width="24" height="30" rx="2" fill="#e8e8e8" />
          <rect x="6" y="3" width="24" height="30" rx="2" stroke="#d0d0d0" strokeWidth="1" />
          <rect x="10" y="12" width="16" height="2.5" rx="1" fill="#c0c0c0" />
          <rect x="10" y="17" width="12" height="2.5" rx="1" fill="#c0c0c0" />
          <rect x="10" y="22" width="14" height="2.5" rx="1" fill="#c0c0c0" />
          <rect x="20" y="3" width="10" height="10" rx="1" fill="#f5a623" />
        </svg>
      </div>

      {/* Title */}
      <p style={{
        fontSize: 18,
        fontWeight: 600,
        color: '#1a1a1a',
        margin: '0 0 8px 0',
      }}>
        {title}
      </p>

      {/* Subtitle */}
      <p style={{
        fontSize: 14,
        color: '#6b7280',
        margin: '0 0 24px 0',
        maxWidth: 320,
      }}>
        {subtitle}
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
        <button
          onClick={() => { history.back(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: '#1a1a1a',
            backgroundColor: '#fff',
            border: '1px solid #d0d0d0',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 7L7 1l6 6" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 6v6h4V8h2v4h4V6" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Go Back
        </button>
      </div>

      {/* Support section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: '#6b7280', fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="7" r="6" stroke="#9ca3af" strokeWidth="1.3" />
          <path d="M7 6v4" stroke="#9ca3af" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="7" cy="4.5" r="0.6" fill="#9ca3af" />
        </svg>
        Need help? Contact our support team
      </div>
      <a
        href="https://wa.me/923362172665"
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 500,
          color: '#fff',
          backgroundColor: '#1a1a1a',
          borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.532 5.856L.057 23.428a.75.75 0 0 0 .916.916l5.572-1.475A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.951 9.951 0 0 1-5.197-1.453l-.372-.221-3.307.875.891-3.257-.242-.384A9.951 9.951 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
        Contact Support on WhatsApp
      </a>
    </div>
  );
}
