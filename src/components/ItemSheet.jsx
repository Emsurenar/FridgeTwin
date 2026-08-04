import { useState } from 'react';
import { Trash2, Check, Package } from 'lucide-react';
import { fmtBandExpiry } from '../lib/fmt';
import { expiryState } from '../lib/expiry';
import { Stepper, LocationPicker, ExpiryPicker } from './Fields';
import Sheet from './Sheet';

export default function ItemSheet({ item, aiOk, onClose, onPatch, onRemove, onToast }) {
  const state = expiryState(item.expiresOn);
  const [count, setCount] = useState(item.count);
  const [location, setLocation] = useState(item.location);
  const [expiresOn, setExpiresOn] = useState(item.expiresOn || '');
  const [saving, setSaving] = useState(false);

  const dirty = count !== item.count || location !== item.location || (expiresOn || null) !== item.expiresOn;

  const save = async () => {
    setSaving(true);
    try {
      /*
        Bara ändrade fält. Tidigare skickades alltid ett absolut count räknat
        på ögonblicksbilden från när arket öppnades — ändrade man bara platsen
        skrevs någon annans antalsändring över på köpet.
      */
      const patch = {};
      if (count !== item.count) patch.count = count;
      if (location !== item.location) patch.location = location;
      if ((expiresOn || null) !== item.expiresOn) patch.expiresOn = expiresOn || null;
      await onPatch(item.id, patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={item.name} onClose={onClose}>
        {/* Samma huvud som raden man tryckte på: bild, namn, nedräkning.
            Kortet ska kännas som en fortsättning, inte som ett formulär man
            landat i. */}
        <div className="ark-huvud">
          <div className="rad-bild" style={{ width: 52, height: 52 }}>
            {item.imageUrl
              ? <img src={item.imageUrl} alt="" />
              : <Package size={21} strokeWidth={1.5} />}
          </div>
          <div className="truncate">
            <h2 className="truncate">{item.name}</h2>
            <span className={`ark-under ${state === 'expired' || state === 'today' ? 'ark-varm' : ''}`}>
              {[fmtBandExpiry(item.expiresOn), item.brand, item.quantity]
                .filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>

        <label>Antal</label>
        <div style={{ marginBottom: 16 }}>
          <Stepper value={count} onChange={setCount} />
        </div>

        <label>Var ligger den?</label>
        <LocationPicker value={location} onChange={setLocation} />

        <label>Bäst före</label>
        <ExpiryPicker value={expiresOn} onChange={setExpiresOn} aiOk={aiOk} onToast={onToast} />

        {/* Att varan är slut eller slängd är inte en ändring man sparar — det
            är ett beslut, och det tas direkt. */}
        <div className="grid-2" style={{ margin: '20px 0 0' }}>
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
    </Sheet>
  );
}
