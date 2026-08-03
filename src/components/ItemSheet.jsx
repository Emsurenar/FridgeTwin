import { useState } from 'react';
import { Trash2, Check, Package } from 'lucide-react';
import { fmtBandExpiry, monogram } from '../lib/fmt';
import { expiryState } from '../lib/expiry';
import { Stepper, LocationPicker, ExpiryPicker } from './Fields';

export default function ItemSheet({ item, aiOk, onClose, onPatch, onRemove, onToast }) {
  const state = expiryState(item.expiresOn);
  const mark = monogram(item.name);
  const [count, setCount] = useState(item.count);
  const [location, setLocation] = useState(item.location);
  const [expiresOn, setExpiresOn] = useState(item.expiresOn || '');
  const [saving, setSaving] = useState(false);

  const dirty = count !== item.count || location !== item.location || (expiresOn || null) !== item.expiresOn;

  const save = async () => {
    setSaving(true);
    try {
      await onPatch(item.id, { count, location, expiresOn: expiresOn || null });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        {/* Samma huvud som bandet i kön: monogram, namn, nedräkning i mono.
            Kortet ska kännas som raden man just tryckte på, inte som ett
            formulär man landat i. */}
        <div className="ark-huvud">
          <div className={`band-img img-${state}`} style={{ width: 52, height: 52 }}>
            {item.imageUrl
              ? <img src={item.imageUrl} alt="" />
              : mark === '?'
              ? <Package size={22} strokeWidth={1.4} />
              : <span className="band-mono" style={{ fontSize: 18 }}>{mark}</span>}
          </div>
          <div className="truncate">
            <h2 className="truncate">{item.name}</h2>
            <span className={`band-when ${state === 'expired' || state === 'today' ? 'ark-varm' : ''}`}>
              {[fmtBandExpiry(item.expiresOn), item.brand, item.quantity]
                .filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>

        <label>Antal</label>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Stepper value={count} onChange={setCount} />
        </div>

        <label>Var ligger den?</label>
        <LocationPicker value={location} onChange={setLocation} />

        <label>Bäst före</label>
        <ExpiryPicker value={expiresOn} onChange={setExpiresOn} aiOk={aiOk} onToast={onToast} />

        {/* Att varan är slut eller slängd är inte en ändring man sparar — det
            är ett beslut, och det tas direkt. */}
        <div className="grid-2" style={{ margin: 'var(--space-5) 0 0' }}>
          <button className="btn-ghost" onClick={() => onRemove(item, 'waste')}>
            <Trash2 size={16} /> Slängd
          </button>
          <button className="btn-ghost" onClick={() => onRemove(item, 'consumed')}>
            <Check size={16} /> Slut
          </button>
        </div>

        <button className="sheet-cta" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Sparar…' : dirty ? 'Spara' : 'Inget ändrat'}
        </button>
      </div>
    </div>
  );
}
