import { useEffect, useRef, useState } from 'react';
import { X, Package, Loader2, Zap, ZapOff, Keyboard } from 'lucide-react';
import { ensureReader, startCamera, stopCamera, scanLoop, buzz } from '../lib/scan';
import { lookupProduct, teachProduct } from '../lib/api';
import { addDays, toIsoDate } from '../lib/expiry';
import { LOCATIONS } from '../lib/fmt';

/*
  Helskärmsskanner. Kameran fortsätter rulla efter varje träff så att en hel
  matkasse kan tömmas i ett svep; samma streckkod ignoreras ett par sekunder
  efter en träff (se scanLoop) så att man kan hålla kvar kameran utan att lägga
  in tio paket smör.

  Autoläge lägger in varan direkt vid träff. Det är snabbare men mindre
  förlåtande, så det är avstängt från början.
*/
// Bara tre snabbval här. Skannern ska gå fort; exakta datum sätter man i varans
// eget kort, där hela datumväljaren finns.
const SCAN_DAYS = [
  { days: 3, label: '3 dagar' },
  { days: 7, label: '1 vecka' },
  { days: 30, label: '1 månad' },
];

export default function ScannerView({ defaultLocation = 'fridge', onAdd, onClose, onToast }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [auto, setAuto] = useState(false);
  const [location, setLocation] = useState(defaultLocation);
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(null); // { barcode, status, product?, name? }
  const [flash, setFlash] = useState(false);
  // Bäst före redan vid träffen. Sitter kvar mellan varor, för en matkasse
  // innehåller sällan bara en färskvara.
  const [days, setDays] = useState(null);

  // Loopen startas en gång men behöver alltid färskaste läget — därför refs.
  const stateRef = useRef({ auto, location, pending, days });
  stateRef.current = { auto, location, pending, days };

  // Valt antal dagar → datum. Räknas ut vid inläggningen, inte vid valet, så
  // att ett skanningspass över midnatt inte sätter gårdagens datum.
  const expiryFrom = (d) => (d ? toIsoDate(addDays(new Date(), d)) : null);

  const handleDetect = async (barcode) => {
    // Låt den vara som redan ligger i kortet stå kvar tills den hanterats.
    if (stateRef.current.pending?.status === 'loading') return;
    buzz();
    setFlash(true);
    setTimeout(() => setFlash(false), 250);
    setPending({ barcode, status: 'loading' });
    try {
      const product = await lookupProduct(barcode);
      if (!product) {
        setPending({ barcode, status: 'unknown', name: '' });
        return;
      }
      if (stateRef.current.auto) {
        setPending(null);
        await onAdd({
          barcode,
          location: stateRef.current.location,
          expiresOn: expiryFrom(stateRef.current.days),
        });
        return;
      }
      setPending({ barcode, status: 'found', product });
    } catch (e) {
      setPending(null);
      onToast(e.message, 'danger');
    }
  };

  const detectRef = useRef(handleDetect);
  detectRef.current = handleDetect;

  useEffect(() => {
    let stream;
    let stopLoop;
    let cancelled = false;

    (async () => {
      try {
        await ensureReader();
        if (cancelled) return;
        stream = await startCamera(videoRef.current);
        if (cancelled) return stopCamera(stream);
        setStarting(false);
        stopLoop = scanLoop(videoRef.current, (code) => detectRef.current(code), () => {});
      } catch (e) {
        if (cancelled) return;
        setStarting(false);
        setError(e.name === 'NotAllowedError'
          ? 'Kameran nekades. Tillåt kameraåtkomst för sajten och försök igen.'
          : e.message || 'Kunde inte starta kameran.');
      }
    })();

    return () => {
      cancelled = true;
      stopLoop?.();
      stopCamera(stream);
    };
  }, []);

  const addFound = async () => {
    const { barcode } = pending;
    setPending(null);
    await onAdd({ barcode, location, expiresOn: expiryFrom(days) });
  };

  const saveUnknown = async () => {
    const name = pending.name.trim();
    if (!name) return;
    await teachProduct(pending.barcode, { name });
    setPending(null);
    await onAdd({ barcode: pending.barcode, name, location, expiresOn: expiryFrom(days) });
  };

  const addManual = async (name) => {
    if (!name.trim()) return;
    setManual(false);
    await onAdd({ name: name.trim(), location, expiresOn: expiryFrom(days) });
  };

  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline />
      <div className="scanner-ui">
        <div className="scanner-topbar">
          <button onClick={onClose} aria-label="Stäng"><X size={18} /> Klar</button>
          <button onClick={() => setAuto(a => !a)}>
            {auto ? <Zap size={16} /> : <ZapOff size={16} />} {auto ? 'Autoläge på' : 'Autoläge av'}
          </button>
        </div>

        <div className="scanner-frame">
          <div>
            <div className={`scanner-window ${flash ? 'hit' : ''}`} />
            <div className="scanner-hint">
              {error ? '' : starting ? 'Startar kameran…' : 'Rikta mot streckkoden'}
            </div>
          </div>
        </div>

        <div className="stack">
          {error && (
            <div className="scan-toast" style={{ display: 'block' }}>
              <p style={{ marginBottom: 12 }}>{error}</p>
              <button className="btn-ghost" onClick={() => setManual(true)}>Lägg till för hand i stället</button>
            </div>
          )}

          {/* Var varan hamnar — bestäms en gång och gäller allt man skannar in */}
          {!pending && !manual && !error && (
            <div className="segmented" style={{ margin: 0 }}>
              {LOCATIONS.map(l => (
                <button key={l.id} className={location === l.id ? 'active' : ''} onClick={() => setLocation(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {pending?.status === 'loading' && (
            <div className="scan-toast">
              <Loader2 size={18} className="spin" />
              <span className="mono">{pending.barcode}</span>
            </div>
          )}

          {pending?.status === 'found' && (
            <div className="scan-toast" style={{ display: 'block' }}>
              <div className="flex-row" style={{ marginBottom: 10 }}>
                <div className="thumb">
                  {pending.product.imageUrl
                    ? <img src={pending.product.imageUrl} alt="" width={44} height={44} style={{ objectFit: 'contain' }} />
                    : <Package size={18} />}
                </div>
                <div className="truncate" style={{ flex: 1 }}>
                  <div className="item-name truncate">{pending.product.name}</div>
                  <div className="item-sub truncate">
                    {[pending.product.brand, pending.product.quantity].filter(Boolean).join(' · ') || 'Open Food Facts'}
                  </div>
                </div>
              </div>
              <div className="chips">
                {SCAN_DAYS.map(d => (
                  <button key={d.days} className={`chip ${days === d.days ? 'chip-on' : ''}`}
                    onClick={() => setDays(days === d.days ? null : d.days)}>
                    {d.label}
                  </button>
                ))}
              </div>
              <button onClick={addFound}>Lägg till</button>
            </div>
          )}

          {pending?.status === 'unknown' && (
            <div className="scan-toast" style={{ display: 'block' }}>
              <p style={{ marginBottom: 10 }}>
                Okänd streckkod <span className="mono">{pending.barcode}</span>. Vad är det för vara?
              </p>
              <input autoFocus value={pending.name} placeholder="t.ex. Arla Gräddfil 5%"
                onChange={e => setPending(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveUnknown()} />
              <div className="grid-2">
                <button className="btn-ghost" onClick={() => setPending(null)}>Hoppa över</button>
                <button onClick={saveUnknown} disabled={!pending.name.trim()}>Spara</button>
              </div>
            </div>
          )}

          {manual && <ManualRow onCancel={() => setManual(false)} onSubmit={addManual} />}

          {!pending && !manual && !error && (
            <button className="btn-ghost" onClick={() => setManual(true)}>
              <Keyboard size={16} /> Vara utan streckkod
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualRow({ onCancel, onSubmit }) {
  const [name, setName] = useState('');
  return (
    <div className="scan-toast" style={{ display: 'block' }}>
      <input autoFocus value={name} placeholder="Vad lägger du in?"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit(name)} />
      <div className="grid-2">
        <button className="btn-ghost" onClick={onCancel}>Avbryt</button>
        <button onClick={() => onSubmit(name)} disabled={!name.trim()}>Lägg till</button>
      </div>
    </div>
  );
}
