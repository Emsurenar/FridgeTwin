import { Minus, Plus } from 'lucide-react';
import { addDays, toIsoDate, ISO_DATE_RE } from '../lib/expiry';
import { fmtExpiry, LOCATIONS } from '../lib/fmt';
import { readBestBefore } from '../lib/ai';
import PhotoButton from './PhotoButton';

// Fälten delas av inläggning och redigering — samma vara ska beskrivas likadant
// oavsett om den just skannats in eller stått i kylen en vecka.

export function Stepper({ value, onChange, min = 1 }) {
  return (
    <div className="stepper">
      <button className="btn-ghost" onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min} aria-label="Färre">
        <Minus size={17} />
      </button>
      <span className="stepper-value">{value}</span>
      <button className="btn-ghost" onClick={() => onChange(value + 1)} aria-label="Fler">
        <Plus size={17} />
      </button>
    </div>
  );
}

export function LocationPicker({ value, onChange }) {
  return (
    <div className="segmented">
      {LOCATIONS.map(l => (
        <button key={l.id} className={value === l.id ? 'active' : ''} onClick={() => onChange(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

const QUICK_DAYS = [
  { days: 2, label: '2 dagar' },
  { days: 5, label: '5 dagar' },
  { days: 7, label: '1 vecka' },
  { days: 14, label: '2 veckor' },
  { days: 30, label: '1 månad' },
];

/*
  Bäst före på tre sätt, i den ordning de faktiskt används: snabbval för det man
  vet ungefär, kamera för det som står tryckt på förpackningen, och datumfältet
  när man vill vara exakt. Snabbvalen ligger först för att de täcker de flesta
  varor på ett tryck.
*/
export function ExpiryPicker({ value, onChange, aiOk, onToast }) {
  const today = toIsoDate(new Date());

  const handlePhoto = async (dataUrl) => {
    try {
      const { date, raw } = await readBestBefore(dataUrl);
      if (!date || !ISO_DATE_RE.test(date)) {
        onToast(raw ? `Kunde inte tolka "${raw}"` : 'Hittade inget datum på bilden', 'danger');
        return;
      }
      onChange(date);
      onToast(`Läste ${fmtExpiry(date)}`);
    } catch (e) {
      onToast(e.message, 'danger');
    }
  };

  return (
    <>
      <div className="chips">
        {QUICK_DAYS.map(q => {
          const iso = toIsoDate(addDays(new Date(), q.days));
          return (
            <button key={q.days} className={`chip ${value === iso ? 'chip-on' : ''}`}
              onClick={() => onChange(value === iso ? '' : iso)}>
              {q.label}
            </button>
          );
        })}
      </div>

      <div className="flex-row" style={{ alignItems: 'stretch', gap: 8 }}>
        <input type="date" value={value} min={today} onChange={e => onChange(e.target.value)}
          style={{ marginBottom: 0 }} />
        {aiOk && (
          <PhotoButton className="btn-ghost btn-square" label="" busyLabel=""
            aria-label="Fota bäst före-datumet" onPhoto={handlePhoto}
            onError={m => onToast(m, 'danger')} />
        )}
      </div>

      {/* fmtExpiry bär redan verbet ("går ut i morgon", "gick ut för 2 dagar
          sedan"), så ett inledande "Går ut" blev dubbelt. Versalen sätts i CSS. */}
      <p className="field-hint">
        {value
          ? <>{fmtExpiry(value)}. <button className="link-btn" onClick={() => onChange('')}>Ta bort datum</button></>
          : 'Utan datum kan varan inte påminna om sig själv.'}
      </p>
    </>
  );
}
