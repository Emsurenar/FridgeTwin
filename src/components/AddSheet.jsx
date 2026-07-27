import { useEffect, useRef, useState } from 'react';
import { Package, ScanLine, Check, Camera } from 'lucide-react';
import { searchProducts } from '../lib/api';
import { Stepper, LocationPicker, ExpiryPicker } from './Fields';

/*
  Ett formulär för hela varan: namn, antal, plats och bäst före på samma skärm,
  med Spara alltid synlig i botten. Tidigare krävde en vara utan streckkod två
  omgångar — lägg in den, öppna den igen, sätt datum — och det andra steget blev
  sällan gjort.

  Namnfältet söker bland varor appen redan känner till (allt som skannats eller
  matats in, av vem som helst i hushållet). Andra gången du lägger in gräddfil
  följer märke, mängd, bild och streckkod med på ett tryck.
*/
export default function AddSheet({ defaultLocation = 'fridge', aiOk, onClose, onAdd, onScan, onPhoto, onToast }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(null); // vald känd produkt
  const [suggestions, setSuggestions] = useState([]);
  const [count, setCount] = useState(1);
  const [location, setLocation] = useState(defaultLocation);
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  // Debounce: varje tangenttryckning ska inte bli ett serveranrop.
  useEffect(() => {
    if (picked || name.trim().length < 2) return setSuggestions([]);
    const t = setTimeout(() => {
      searchProducts(name.trim()).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [name, picked]);

  const choose = (p) => {
    setPicked(p);
    setName(p.name);
    setSuggestions([]);
  };

  const clearPick = () => {
    setPicked(null);
    inputRef.current?.focus();
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd({
        name: trimmed,
        barcode: picked?.barcode || null,
        brand: picked?.brand || null,
        quantity: picked?.quantity || null,
        imageUrl: picked?.imageUrl || null,
        count,
        location,
        expiresOn: expiresOn || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h2>Lägg in en vara</h2>
          {/* De tre vägarna in i kylskåpet sitter ihop: skriv, skanna eller fota */}
          <div className="flex-row" style={{ gap: 6 }}>
            <button className="btn-ghost btn-pill" onClick={onScan}>
              <ScanLine size={15} /> Skanna
            </button>
            {aiOk && (
              <button className="btn-ghost btn-pill" onClick={onPhoto} aria-label="Identifiera med foto">
                <Camera size={15} />
              </button>
            )}
          </div>
        </div>

        <label htmlFor="add-name">Vad är det?</label>
        <input id="add-name" ref={inputRef} autoFocus value={name} placeholder="t.ex. Gräddfil"
          onChange={e => { setName(e.target.value); setPicked(null); }}
          style={{ marginBottom: suggestions.length ? 4 : 12 }} />

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map(p => (
              <button key={p.barcode} className="suggestion" onClick={() => choose(p)}>
                <div className="thumb thumb-sm">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Package size={16} />}
                </div>
                <span className="truncate" style={{ flex: 1, textAlign: 'left' }}>
                  <span className="item-name truncate">{p.name}</span>
                  <span className="item-sub truncate">
                    {[p.brand, p.quantity].filter(Boolean).join(' · ') || 'Känd sedan tidigare'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="picked">
            <div className="thumb thumb-sm">
              {picked.imageUrl ? <img src={picked.imageUrl} alt="" /> : <Package size={16} />}
            </div>
            <span className="truncate" style={{ flex: 1 }}>
              <span className="item-sub truncate">
                <Check size={12} /> {[picked.brand, picked.quantity].filter(Boolean).join(' · ') || 'Känd vara'}
              </span>
            </span>
            <button className="link-btn" onClick={clearPick}>Ändra</button>
          </div>
        )}

        <div className="grid-2" style={{ alignItems: 'end', marginBottom: 'var(--space-4)' }}>
          <div>
            <label>Antal</label>
            <Stepper value={count} onChange={setCount} />
          </div>
        </div>

        <label>Var ska den ligga?</label>
        <LocationPicker value={location} onChange={setLocation} />

        <label>Bäst före</label>
        <ExpiryPicker value={expiresOn} onChange={setExpiresOn} aiOk={aiOk} onToast={onToast} />

        <button className="sheet-cta" onClick={save} disabled={!name.trim() || saving}>
          {saving ? 'Lägger in…' : 'Lägg in'}
        </button>
      </div>
    </div>
  );
}
