import { useState } from 'react';
import { Minus, Plus, Trash2, Check, Package } from 'lucide-react';
import { addDays, toIsoDate, ISO_DATE_RE } from '../lib/expiry';
import { fmtExpiry, LOCATIONS } from '../lib/fmt';
import { readBestBefore } from '../lib/ai';
import PhotoButton from './PhotoButton';

const QUICK_DAYS = [
  { days: 3, label: '3 dagar' },
  { days: 7, label: '1 vecka' },
  { days: 14, label: '2 veckor' },
];

export default function ItemSheet({ item, aiOk, onClose, onPatch, onRemove, onToast }) {
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

  const handleDatePhoto = async (dataUrl) => {
    try {
      const { date, raw } = await readBestBefore(dataUrl);
      if (!date || !ISO_DATE_RE.test(date)) {
        onToast(raw ? `Kunde inte tolka "${raw}"` : 'Hittade inget datum på bilden', 'danger');
        return;
      }
      setExpiresOn(date);
      onToast(`Läste ${fmtExpiry(date)}`);
    } catch (e) {
      onToast(e.message, 'danger');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="flex-row" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="thumb" style={{ width: 52, height: 52 }}>
            {item.imageUrl
              ? <img src={item.imageUrl} alt="" width={52} height={52} style={{ objectFit: 'contain' }} />
              : <Package size={20} />}
          </div>
          <div className="truncate">
            <h2 className="truncate">{item.name}</h2>
            <p className="truncate" style={{ fontSize: '0.8rem' }}>
              {[item.brand, item.quantity].filter(Boolean).join(' · ') || 'Egen post'}
            </p>
          </div>
        </div>

        <label>Antal</label>
        <div className="flex-row" style={{ marginBottom: 'var(--space-5)' }}>
          <button className="btn-ghost btn-inline" style={{ minWidth: 48 }}
            onClick={() => setCount(c => Math.max(1, c - 1))} aria-label="Färre">
            <Minus size={17} />
          </button>
          <span className="mono" style={{ fontSize: '1.2rem', minWidth: 36, textAlign: 'center' }}>{count}</span>
          <button className="btn-ghost btn-inline" style={{ minWidth: 48 }}
            onClick={() => setCount(c => c + 1)} aria-label="Fler">
            <Plus size={17} />
          </button>
        </div>

        <label>Var ligger den?</label>
        <div className="segmented on-elevated">
          {LOCATIONS.map(l => (
            <button key={l.id} className={location === l.id ? 'active' : ''} onClick={() => setLocation(l.id)}>
              {l.label}
            </button>
          ))}
        </div>

        <label>Bäst före</label>
        <input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} />
        <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 'var(--space-4)' }}>
          {QUICK_DAYS.map(q => (
            <button key={q.days} className="btn-ghost btn-pill"
              onClick={() => setExpiresOn(toIsoDate(addDays(new Date(), q.days)))}>
              {q.label}
            </button>
          ))}
          {expiresOn && (
            <button className="btn-ghost btn-pill" onClick={() => setExpiresOn('')}>Inget datum</button>
          )}
        </div>

        {aiOk && (
          <PhotoButton className="btn-ghost" label="Fota datumet" busyLabel="Läser datum…"
            onPhoto={handleDatePhoto} />
        )}

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
