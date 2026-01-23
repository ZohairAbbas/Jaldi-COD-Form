import React, { useState, useEffect } from 'react';

export default function CODForm({ config, cart, onSubmit, onClose, mode = 'popup' }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '+92',
    email: '',
    address: '',
    address2: '',
    city: '',
    province: '',
    postalCode: '',
    customFields: {},
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formStyle = {
    backgroundColor: config.formConfig.backgroundColor,
    color: config.formConfig.textColor,
    fontSize: `${config.formConfig.fontSize}px`,
    borderRadius: mode === 'popup' ? `${config.formConfig.borderRadius}px` : '0',
    border: mode === 'popup' ? 'none' : `${config.formConfig.borderWidth}px solid ${config.formConfig.borderColor}`,
    boxShadow: mode === 'popup' ? 'none' : `0 ${config.formConfig.shadowIntensity}px ${config.formConfig.shadowIntensity * 2}px rgba(0,0,0,0.1)`,
    padding: '0',
    maxWidth: mode === 'popup' ? '500px' : '100%',
    width: '100%',
    maxHeight: mode === 'popup' ? '90vh' : 'auto',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  };

  const visibleSections = config.formConfig.sections
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  const visibleFields = config.formConfig.fields
    .filter(f => f.visible && f.section === 'shipping-address')
    .sort((a, b) => a.order - b.order);

  const handleChange = (fieldId, value) => {
    // Special handling for phone field
    if (fieldId === 'phone') {
      // Ensure +92 prefix is always present
      if (!value.startsWith('+92')) {
        value = '+92';
      }
      // Only allow numbers after +92
      const digitsOnly = value.slice(3).replace(/\D/g, '');
      value = '+92' + digitsOnly;
    }

    setFormData(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when user types
    if (errors[fieldId]) {
      setErrors(prev => ({ ...prev, [fieldId]: null }));
    }
  };

  const handleCustomFieldChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: value },
    }));
  };

  const validate = () => {
    const newErrors = {};

    visibleFields.forEach(field => {
      if (field.required) {
        const value = field.id.startsWith('custom-')
          ? formData.customFields[field.id]
          : formData[field.id.replace(/-/g, '')];

        if (!value || value.trim() === '') {
          newErrors[field.id] = config.formConfig.requiredFieldErrorText;
        }
      }

      // Special validation for phone field
      if (field.id === 'phone') {
        const phoneValue = formData.phone;
        if (!phoneValue.startsWith('+92')) {
          newErrors['phone'] = 'Phone number must start with +92';
        } else {
          const digitsAfterPrefix = phoneValue.slice(3);
          if (digitsAfterPrefix.length !== 10) {
            newErrors['phone'] = 'Phone number must be exactly 10 digits after +92';
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    const orderData = {
      shop: config.shopDomain,
      firstName: formData.firstName || formData.firstname,
      lastName: formData.lastName || formData.lastname,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      address2: formData.address2,
      city: formData.city,
      province: formData.province,
      postalCode: formData.postalCode || formData.postalcode,
      country: 'Pakistan',
      items: cart.items,
      customFields: formData.customFields,
      shippingCost: 0,
    };

    try {
      await onSubmit(orderData);
    } catch (error) {
      console.error('Order submission error:', error);
      alert('Failed to submit order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Icon components
  const PersonIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const PhoneIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );

  const EmailIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );

  const LocationIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );

  const renderField = (field) => {
    const fieldId = field.id.replace(/-/g, '');
    const value = formData[fieldId] || '';
    const error = errors[field.id];

    const hasIcon = ['first-name', 'last-name', 'phone', 'email', 'address', 'city'].includes(field.id);

    const inputStyle = {
      width: '100%',
      padding: hasIcon ? '10px 12px 10px 42px' : '10px 12px',
      borderRadius: '4px',
      border: error ? '1px solid #EF4444' : '1px solid #D1D5DB',
      fontSize: '14px',
      color: '#111827',
      backgroundColor: '#FFFFFF',
      outline: 'none',
    };

    const labelStyle = {
      display: 'block',
      marginBottom: '6px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#111827',
    };

    const errorStyle = {
      color: '#EF4444',
      fontSize: '12px',
      marginTop: '4px',
    };

    const getFieldIcon = (fieldId) => {
      if (fieldId === 'first-name' || fieldId === 'last-name') return <PersonIcon />;
      if (fieldId === 'phone') return <PhoneIcon />;
      if (fieldId === 'email') return <EmailIcon />;
      if (fieldId === 'address' || fieldId === 'city') return <LocationIcon />;
      return null;
    };

    switch (field.type) {
      case 'text':
        return (
          <div key={field.id} style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <div style={{ position: 'relative' }}>
              {getFieldIcon(field.id)}
              <input
                type={field.id === 'phone' ? 'tel' : field.id === 'email' ? 'email' : 'text'}
                value={value}
                onChange={(e) => handleChange(fieldId, e.target.value)}
                placeholder={field.id === 'phone' ? '+923001234567' : field.placeholder}
                maxLength={field.id === 'phone' ? 13 : undefined}
                style={inputStyle}
              />
            </div>
            {error && <div style={errorStyle}>{error}</div>}
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.id} style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              style={inputStyle}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {field.options?.map((opt, idx) => (
                <option key={idx} value={opt}>{opt}</option>
              ))}
            </select>
            {error && <div style={errorStyle}>{error}</div>}
          </div>
        );

      default:
        return null;
    }
  };

  const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div style={formStyle}>
      {/* Fixed Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #E5E7EB',
        flexShrink: 0,
        position: 'relative',
      }}>
        {mode === 'popup' && onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              color: '#000',
              lineHeight: '1',
              fontWeight: '300',
            }}
          >
            ×
          </button>
        )}

        <h2 style={{
          margin: '0',
          fontSize: '18px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          color: '#000',
        }}>
          {config.formConfig.formTitle}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '20px 24px 24px 24px',
      }}>
        <form onSubmit={handleSubmit}>
        {visibleSections.map((section) => {
          switch (section.type) {
            case 'orderSummary':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  {/* <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '12px',
                    color: '#000',
                  }}>
                    Order Summary
                  </h3> */}
                  {cart.items.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '12px',
                      marginBottom: idx === cart.items.length - 1 ? '0' : '16px',
                      position: 'relative',
                    }}>
                      {/* Product Image with Quantity Badge */}
                      {item.image && (
                        <div style={{
                          width: '64px',
                          height: '64px',
                          flexShrink: 0,
                          borderRadius: '8px',
                          overflow: 'visible',
                          backgroundColor: '#F3F4F6',
                          position: 'relative',
                          border: '1px solid #E5E7EB',
                        }}>
                          <img
                            src={item.image}
                            alt={item.title}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '7px',
                            }}
                          />
                          {/* Quantity Badge - Top Left */}
                          <div style={{
                            position: 'absolute',
                            top: '-8px',
                            left: '-8px',
                            backgroundColor: '#6B7280',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            border: '2px solid #fff',
                          }}>
                            {item.quantity}
                          </div>
                        </div>
                      )}

                      {/* Product Details */}
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        minWidth: 0,
                      }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#111827',
                          marginBottom: '4px',
                          lineHeight: '1.4',
                        }}>
                          {item.title}
                        </div>
                        {item.variant && (
                          <div style={{
                            fontSize: '13px',
                            color: '#6B7280',
                            lineHeight: '1.4',
                          }}>
                            {item.variant}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#111827',
                        whiteSpace: 'nowrap',
                        alignSelf: 'center',
                      }}>
                        Rs.{(item.price * item.quantity).toFixed(2)}
                      </div>

                      {/* Remove Button (X) - Top Right */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          // Handle remove item - for now just a placeholder
                          console.log('Remove item:', item.variantId);
                        }}
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          background: '#6B7280',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#fff',
                          fontSize: '12px',
                          lineHeight: '1',
                          padding: '0',
                          fontWeight: '600',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              );

            case 'totals':
              return (
                <div key={section.id} style={{
                  marginBottom: '20px',
                  padding: '16px',
                  backgroundColor: '#F3F4F6',
                  borderRadius: '6px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#374151',
                  }}>
                    <span>Subtotal</span>
                    <span style={{ color: '#111827', fontWeight: '600' }}>Rs.{total.toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#374151',
                  }}>
                    <span>Shipping</span>
                    <span style={{ color: '#10B981', fontWeight: '600' }}>Free</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #D1D5DB',
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#111827',
                  }}>
                    <span>Total</span>
                    <span>Rs.{total.toFixed(2)}</span>
                  </div>
                </div>
              );

            case 'shippingMethod':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '12px',
                    color: '#000',
                  }}>
                    Shipping Method
                  </h3>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: '#FFFFFF',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        checked
                        readOnly
                        style={{
                          width: '16px',
                          height: '16px',
                          accentColor: '#000',
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#111827' }}>Free shipping</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#10B981' }}>Free</span>
                  </label>
                </div>
              );

            case 'shippingAddress':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    color: '#000',
                  }}>
                    Enter your shipping address
                  </h3>
                  {visibleFields.map(renderField)}
                </div>
              );

            default:
              return null;
          }
        })}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '14px 20px',
            backgroundColor: '#000000',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
            transition: 'opacity 0.2s',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {isSubmitting ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div className="jaldi-loading"></div>
              <span>Processing...</span>
            </div>
          ) : (
            `PROCEED TO CHECKOUT - Rs.${total.toFixed(2)}`
          )}
        </button>
      </form>
      </div>
    </div>
  );
}
