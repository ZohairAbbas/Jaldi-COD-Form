import React from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Step 3 — delivery address.
 *
 * Two modes, as in the design: pick a saved address, or fill a new one. The
 * new-address form and the per-card edit form are NOT rebuilt here — they are
 * passed in as nodes so they keep coming from CODForm's `renderField`, which
 * owns merchant field config, custom fields, labels and validation. This
 * component supplies the design chrome around them.
 */
export default function AddressStep({
  lang = 'en',
  isRTL = false,
  addresses = [],
  selectedId,
  onSelect,
  mode = 'saved',
  onAddNew,
  onUseSaved,
  editingAddressId,
  onEditAddress,
  onDeleteAddress,
  renderEditForm,
  newAddressNode,
  onContinue,
  continueDisabled = false,
}) {
  const hasSaved = addresses.length > 0;

  return (
    <div className="jaldi-sc-step-pane">
      <div>
        <h2 className="jaldi-sc-h2">{t(lang, 'whereShouldWeDeliver')}</h2>
        {hasSaved && mode === 'saved' && (
          <p className="jaldi-sc-sub">{t(lang, 'savedFromLastOrders')}</p>
        )}
      </div>

      {mode === 'saved' && hasSaved && (
        <div className="jaldi-sc-stack">
          {addresses.map((addr) => (
            <AddressCard
              key={addr.id}
              addr={addr}
              lang={lang}
              selected={selectedId === addr.id}
              editing={editingAddressId === addr.id}
              onSelect={() => onSelect(addr.id)}
              onEdit={() => onEditAddress(addr.id)}
              onDelete={onDeleteAddress && addresses.length > 1 ? () => onDeleteAddress(addr.id) : null}
              editForm={editingAddressId === addr.id ? renderEditForm(addr) : null}
            />
          ))}
        </div>
      )}

      {mode === 'saved' && (
        <button type="button" onClick={onAddNew} className="jaldi-sc-add-address jaldi-sc-hit">
          <Icon.Plus size={14} /> {t(lang, 'addNewAddress')}
        </button>
      )}

      {mode === 'new' && (
        <div className="jaldi-sc-stack">
          {newAddressNode}
          {hasSaved && (
            <button type="button" className="jaldi-sc-link jaldi-sc-back-link" onClick={onUseSaved}>
              {isRTL ? '→' : '←'} {t(lang, 'useSavedAddress')}
            </button>
          )}
        </div>
      )}

      <div className="jaldi-sc-spacer" />

      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="jaldi-sc-cta jaldi-sc-hit"
      >
        {t(lang, 'continueToReview')}
        <Icon.ChevronRight size={14} style={isRTL ? { transform: 'scaleX(-1)' } : undefined} />
      </button>
    </div>
  );
}

function AddressCard({ addr, lang, selected, editing, onSelect, onEdit, onDelete, editForm }) {
  const lines = [addr.address, addr.address2].filter(Boolean);
  const tail = [addr.city, addr.province].filter(Boolean).join(', ');

  return (
    <div className={`jaldi-sc-addr${selected ? ' is-selected' : ''}`}>
      <div
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
        }}
        className="jaldi-sc-addr-main"
      >
        <span className="jaldi-sc-radio" aria-hidden="true" />

        <div className="jaldi-sc-addr-body">
          <div className="jaldi-sc-addr-tags">
            {addr.label && <span className="jaldi-sc-tag">{addr.label}</span>}
            {addr.isDefault && (
              <span className="jaldi-sc-verified">
                <Icon.Check size={11} /> {t(lang, 'verified')}
              </span>
            )}
          </div>
          <div className="jaldi-sc-addr-lines">
            {lines.map((l, i) => <div key={i}>{l}</div>)}
            {tail && <div>{tail}</div>}
          </div>
        </div>

        <span className="jaldi-sc-addr-actions">
          <button
            type="button"
            className="jaldi-sc-addr-edit"
            aria-label={t(lang, 'edit')}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Icon.Edit size={13} />
          </button>
          {/* Deleting a saved address existed before the redesign; the
              prototype card has no delete affordance, but dropping it would be
              a regression. Hidden on the last address so a buyer can't strand
              themselves with none. */}
          {onDelete && (
            <button
              type="button"
              className="jaldi-sc-addr-edit"
              aria-label={t(lang, 'deleteAddress')}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Icon.Trash size={13} />
            </button>
          )}
        </span>
      </div>

      {editing && <div className="jaldi-sc-addr-edit-form">{editForm}</div>}
    </div>
  );
}
