import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { identifyItems } from '../lib/ai';
import { addDays, toIsoDate } from '../lib/expiry';
import { fmtExpiry, LOCATIONS, locationLabel } from '../lib/fmt';
import PhotoButton from './PhotoButton';
import Sheet from './Sheet';

/*
  AI-igenkänning för varor utan streckkod — lösvikt, en hel hylla, en fruktskål.

  Inget läggs in automatiskt. Modellen gissar ibland fel, och ett kylskåp fullt
  av spökvaror är värre än inget register alls: då slutar man lita på listan.
  Därför bockar man av förslagen först, och det som ser fel ut kryssas bara ur.
*/
export default function PhotoIdentifySheet({ onClose, onAddMany, onToast }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState(null); // [{ name, count, location, expiresOn, checked }]

  const handlePhoto = async (dataUrl) => {
    setBusy(true);
    setRows(null);
    try {
      const result = await identifyItems(dataUrl);
      setNote(result.note);
      setRows(result.items.map(i => ({
        name: i.name,
        count: Math.max(1, Math.round(i.count || 1)),
        location: LOCATIONS.some(l => l.id === i.location) ? i.location : 'fridge',
        expiresOn: i.shelfLifeDays > 0 ? toIsoDate(addDays(new Date(), Math.round(i.shelfLifeDays))) : null,
        // Osäkra gissningar är förkryssade men inte förvalda — man ser dem, och
        // får aktivt välja in dem.
        checked: (i.confidence ?? 1) >= 0.6,
      })));
      if (!result.items.length) onToast('Hittade inga varor på bilden', 'danger');
    } catch (e) {
      onToast(e.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (idx) => setRows(rs => rs.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)));

  const chosen = rows?.filter(r => r.checked) || [];

  const add = async () => {
    setBusy(true);
    try {
      await onAddMany(chosen.map(({ name, count, location, expiresOn }) => ({ name, count, location, expiresOn })));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={'Identifiera med foto'} onClose={onClose}>
        <h2 style={{ marginBottom: 4 }}>Identifiera med foto</h2>
        <p style={{ marginBottom: 20 }}>
          Fota lösvikt eller en hel hylla — Claude föreslår vad det är, du bockar av.
        </p>

        <PhotoButton label={rows ? 'Ta ett nytt foto' : 'Ta foto'} busyLabel="Tittar på bilden…"
          className={rows ? 'btn-ghost' : ''} onPhoto={handlePhoto} disabled={busy} />

        {busy && !rows && <p style={{ marginTop: 16, textAlign: 'center' }}>Claude tittar på bilden…</p>}

        {note && <p style={{ marginTop: 16 }}>{note}</p>}

        {rows?.length > 0 && (
          <>
            <h3 className="eyebrow">{rows.length} förslag</h3>
            <div className="stack">
              {rows.map((r, i) => (
                // <button> och inte <div onClick>: raden är ett val man ska
                // kunna göra med tangentbord, och aria-pressed säger vilket
                // läge den står i när färgen inte går att se.
                <button key={i} type="button" className="item-row"
                  onClick={() => toggle(i)} aria-pressed={r.checked}>
                  <div className={`check-box ${r.checked ? 'on' : ''}`} aria-hidden="true">
                    <Check size={16} />
                  </div>
                  <div className="truncate" style={{ flex: 1 }}>
                    <div className="item-name truncate">{r.name}</div>
                    <div className="item-sub truncate">
                      {locationLabel(r.location)}
                      {r.expiresOn ? ` · ${fmtExpiry(r.expiresOn)}` : ''}
                    </div>
                  </div>
                  {r.count > 1 && <span className="count-badge">{r.count}</span>}
                </button>
              ))}
            </div>

            <button className="sheet-cta" onClick={add} disabled={!chosen.length || busy}>
              <Sparkles size={16} />
              {chosen.length ? `Lägg till ${chosen.length} varor` : 'Inget valt'}
            </button>
          </>
        )}
    </Sheet>
  );
}
