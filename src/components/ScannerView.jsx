import { useEffect, useRef, useState } from 'react';
import { X, Package, Loader2, Zap, ZapOff, Keyboard } from 'lucide-react';
import { ensureReader, startCamera, stopCamera, scanLoop, buzz } from '../lib/scan';
import { lookupProduct, teachProduct } from '../lib/api';
import { addDays, toIsoDate, ISO_DATE_RE } from '../lib/expiry';
import { readBestBefore } from '../lib/ai';
import { LOCATIONS, locationLabel, fmtExpiry } from '../lib/fmt';
import { alreadyHome, summarize, totalCount } from '../lib/owned';
import { Stepper } from './Fields';
import PhotoButton from './PhotoButton';

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

export default function ScannerView({ defaultLocation = 'fridge', items = [], aiOk, onAdd, onConsumeOne, onLocationChange, onClose, onToast }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [auto, setAuto] = useState(false);
  const [location, setLocation] = useState(defaultLocation);
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(null); // { barcode, status, product?, name? }
  const [flash, setFlash] = useState(false);
  /*
    Bäst före på två sätt, och de utesluter varandra.

    Snabbvalen är *relativa* och sitter kvar mellan varor, för en matkasse
    innehåller sällan bara en färskvara. Fotot ger ett *absolut* datum läst från
    förpackningen och gäller bara den varan — nästa förpackning har ett eget
    tryck. Därför nollas fotodatumet efter varje inläggning medan dagarna står
    kvar.
  */
  const [days, setDays] = useState(null);
  const [photoDate, setPhotoDate] = useState(null);
  // Antalet hör till förpackningen framför kameran, inte till passet. Två liter
  // mjölk är två tryck på plus, men nästa vara börjar om på ett.
  const [count, setCount] = useState(1);

  // Loopen startas en gång men behöver alltid färskaste läget — därför refs.
  const stateRef = useRef({ auto, location, pending, days });
  stateRef.current = { auto, location, pending, days };

  /*
    Skannern stängs ofta mitt i något: ett produktuppslag är i luften, eller ett
    foto håller på att läsas. Kom svaret efter att vyn stängts satte det
    tillstånd på en avmonterad komponent — och en toast om ett fel för en
    kamera som inte längre är uppe. Refen låter de svaren rinna ut i sanden.
  */
  const levande = useRef(true);
  const flashTimer = useRef(null);

  // Valt antal dagar → datum. Räknas ut vid inläggningen, inte vid valet, så
  // att ett skanningspass över midnatt inte sätter gårdagens datum. Ett fotat
  // datum är redan absolut och går före.
  const expiryFrom = (d) => (d ? toIsoDate(addDays(new Date(), d)) : null);
  const expiryNow = () => photoDate || expiryFrom(days);

  // Efter varje inlagd vara: antal och fotodatum tillbaka till utgångsläget,
  // plats och snabbval kvar.
  const resetPerItem = () => { setCount(1); setPhotoDate(null); };

  /*
    Skicka med det vi redan vet om varan, inte bara streckkoden.

    Servern kan slå upp namnet själv, men bara ur sin egen produktcache — och
    utan TURSO_URL ligger den i en lambdas /tmp. Uppslaget som fyllde kortet kan
    ha hanterats av en annan instans än den som tar emot inläggningen, och då är
    cachen tom: svaret blev "Namn krävs" trots att namnet stod på skärmen.
    Klienten har uppgifterna framför sig; då ska den skicka dem.
  */
  const fromProduct = (p) => ({
    name: p?.name || undefined,
    brand: p?.brand || undefined,
    quantity: p?.quantity || undefined,
    imageUrl: p?.imageUrl || undefined,
  });

  const handleDatePhoto = async (dataUrl) => {
    try {
      const { date, raw } = await readBestBefore(dataUrl);
      if (!levande.current) return;
      if (!date || !ISO_DATE_RE.test(date)) {
        return onToast(raw ? `Kunde inte tolka "${raw}"` : 'Hittade inget datum på bilden', 'danger');
      }
      setPhotoDate(date);
      setDays(null); // ett läst datum slår ett gissat
      onToast(`Läste ${fmtExpiry(date)}`);
    } catch (e) {
      if (levande.current) onToast(e.message, 'danger');
    }
  };

  /*
    Överhoppade koder tystas en stund.

    scanLoop har en avkylning på ett par sekunder så att man kan hålla kvar
    kameran utan att lägga in tio paket smör — men den är redan förbrukad när
    man hunnit läsa kortet och tryckt "Hoppa över". Utan det här dök samma vara
    upp igen direkt, och knappen betydde ingenting. Femton sekunder räcker för
    att flytta telefonen till nästa förpackning.
  */
  const overhoppade = useRef(new Map());
  const SKIP_MS = 15000;

  const hoppaOver = () => {
    if (pending?.barcode) overhoppade.current.set(pending.barcode, Date.now());
    setPending(null);
    resetPerItem();
  };

  const handleDetect = async (barcode) => {
    const skippad = overhoppade.current.get(barcode);
    if (skippad && Date.now() - skippad < SKIP_MS) return;
    if (skippad) overhoppade.current.delete(barcode);

    /*
      Låt den vara som redan ligger i kortet stå kvar tills den hanterats.

      Spärren gällde bara 'loading', vilket inte var vad kommentaren lovade: en
      annan kod som råkade komma in i bild kastade bort ett öppet kort — och med
      det namnet man höll på att skriva in för en okänd streckkod. Autoläget
      nollar pending självt efter varje träff, så en hel matkasse går fortfarande
      att tömma i ett svep.
    */
    if (stateRef.current.pending) return;
    buzz();
    clearTimeout(flashTimer.current);
    setFlash(true);
    flashTimer.current = setTimeout(() => setFlash(false), 250);
    setPending({ barcode, status: 'loading' });
    try {
      const product = await lookupProduct(barcode);
      if (!levande.current) return;
      if (!product) {
        setPending({ barcode, status: 'unknown', name: '' });
        return;
      }
      if (stateRef.current.auto) {
        setPending(null);
        // Egen catch: onAdd (Apps handleAdd) visar redan felet och kastar
        // vidare. Utan den här fångades det av catch-blocket nedan, och
        // användaren fick samma röda besked två gånger.
        try {
          await onAdd({
            barcode,
            ...fromProduct(product),
            location: stateRef.current.location,
            expiresOn: expiryFrom(stateRef.current.days),
          });
        } catch { /* redan rapporterat */ }
        return;
      }
      setPending({ barcode, status: 'found', product });
    } catch (e) {
      if (!levande.current) return;
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
    // Sätts om vid varje montering: i StrictMode körs effekten två gånger, och
    // en flagga som bara sattes till false hade lämnat skannern död i utveckling.
    levande.current = true;

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

    /*
      Väck strömmen igen när den blivit avstängd under oss.

      iOS låter inte två konsumenter hålla kameran samtidigt. Trycker man "Fota
      datumet" — som skannern själv erbjuder mitt i sökaren — tar systemkameran
      över, och sidans spår slutar leverera bildrutor. Samma sak vid ett
      inkommande samtal, en låst skärm eller ett app-byte. Sökaren visade då en
      frusen bild med texten "Rikta mot streckkoden" kvar, och ingen kod lästes
      någonsin mer; enda vägen ut var att stänga och öppna skannern igen, mitt i
      en matkasse.

      scanLoop märker ingenting, eftersom dess hälsokontroll är readyState och
      videoWidth — båda är fortfarande sanna på en pausad video med en
      kvarhängande bildruta. Därför får återstarten hänga på synligheten i
      stället, som är den signal webbläsaren faktiskt ger oss.
    */
    const aterstarta = async () => {
      if (cancelled || document.hidden || !videoRef.current) return;
      const spar = stream?.getVideoTracks?.()[0];
      const levandeSpar = spar && spar.readyState === 'live';
      if (levandeSpar && !videoRef.current.paused) return; // allt är som det ska
      try {
        if (!levandeSpar) {
          stopCamera(stream);
          stream = await startCamera(videoRef.current);
          if (cancelled) return stopCamera(stream);
        } else {
          await videoRef.current.play();
        }
        setError(null);
      } catch {
        // Nekas kameran nu är det inget vi kan lösa här; nästa gång vyn öppnas
        // går den vanliga uppstarten och ger ett riktigt felmeddelande.
      }
    };

    document.addEventListener('visibilitychange', aterstarta);

    return () => {
      cancelled = true;
      levande.current = false;
      clearTimeout(flashTimer.current);
      document.removeEventListener('visibilitychange', aterstarta);
      stopLoop?.();
      stopCamera(stream);
    };
  }, []);

  const addFound = async () => {
    const { barcode, product } = pending;
    const payload = { barcode, ...fromProduct(product), location, count, expiresOn: expiryNow() };
    setPending(null);
    resetPerItem();
    await onAdd(payload);
  };

  /*
    Spara-knappen och Enter är kvar och tryckbara under hela nätverksanropet,
    eftersom inget tillstånd ändras före await. Två tryck lade in varan två
    gånger. Refen stänger glappet direkt, till skillnad från ett disabled som
    slår igenom först vid nästa rendering.
  */
  const savingUnknown = useRef(false);
  const saveUnknown = async () => {
    const name = pending.name.trim();
    if (!name || savingUnknown.current) return;
    savingUnknown.current = true;
    try {
      const payload = { barcode: pending.barcode, name, location, count, expiresOn: expiryNow() };
      await teachProduct(pending.barcode, { name });
      setPending(null);
      resetPerItem();
      await onAdd(payload);
    } catch (e) {
      // Utan det här trycker man Spara och får varken vara eller besked.
      onToast(e.message, 'danger');
    } finally {
      savingUnknown.current = false;
    }
  };

  const addManual = async (name) => {
    if (!name.trim()) return;
    try {
      await onAdd({ name: name.trim(), location, count, expiresOn: expiryNow() });
      // Stäng först när det lyckats — annars raderades namnet man just skrev.
      setManual(false);
      resetPerItem();
    } catch { /* handleAdd har redan visat felet */ }
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

          {/*
            Var varan hamnar. Ligger kvar synlig även när ett produktkort är
            öppet — tidigare doldes den, så för att flytta en vara till frysen
            fick man lägga in den i kylen och rätta till det efteråt. Valet
            gäller vidare för nästa vara, så en hel matkasse till frysen är ett
            tryck och inte ett per förpackning.
          */}
          {!manual && !error && (
            <div className="segmented" style={{ margin: 0 }}>
              {LOCATIONS.map(l => (
                <button key={l.id} className={location === l.id ? 'active' : ''}
                  aria-pressed={location === l.id}
                  onClick={() => { setLocation(l.id); onLocationChange?.(l.id); }}>
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {pending?.status === 'loading' && (
            <div className="scan-toast">
              <Loader2 size={18} className="spin" />
              <span className="truncate" style={{ flex: 1 }}>{pending.barcode}</span>
              <button className="btn-ghost btn-pill" onClick={hoppaOver}>Avbryt</button>
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

              {/* Har man den redan är det halva svaret på varför man skannar:
                  antingen köpte man en till, eller så är den här slut. Båda
                  ska gå att göra utan att lämna sökaren. */}
              <Owned items={items} barcode={pending.barcode} onConsumeOne={onConsumeOne} />

              <div className="scan-row">
                <span className="scan-label">Antal</span>
                <Stepper value={count} onChange={setCount} />
              </div>

              <span className="scan-label">Bäst före</span>
              <div className="chips">
                {SCAN_DAYS.map(d => (
                  <button key={d.days} className={`chip ${!photoDate && days === d.days ? 'chip-on' : ''}`}
                    onClick={() => { setPhotoDate(null); setDays(days === d.days ? null : d.days); }}>
                    {d.label}
                  </button>
                ))}
                {/* Fota datumet i stället för att gissa. Systemkameran via
                    <input capture> ger skärpa och blixt, vilket en avläsning av
                    liten tryckt text behöver mer än skannerströmmen gör. */}
                {aiOk && (
                  <PhotoButton className="chip chip-foto" label="Fota datumet"
                    busyLabel="Läser…" onPhoto={handleDatePhoto}
                    onError={m => onToast(m, 'danger')} />
                )}
              </div>

              {photoDate && (
                <p className="scan-last">
                  Läst från förpackningen: <strong>{fmtExpiry(photoDate)}</strong>
                  <button className="link-btn" onClick={() => setPhotoDate(null)}>Ta bort</button>
                </p>
              )}

              {/* Att ångra sig får inte kosta hela kameran. Tidigare fanns bara
                  "Lägg till" — skannade man fel vara var enda vägen ut att
                  stänga skannern och öppna den igen. */}
              <div className="grid-2">
                <button className="btn-ghost" onClick={hoppaOver}>
                  Hoppa över
                </button>
                <button onClick={addFound}>
                  Lägg till{count > 1 ? ` ${count} st` : ''}
                </button>
              </div>
            </div>
          )}

          {pending?.status === 'unknown' && (
            <div className="scan-toast" style={{ display: 'block' }}>
              <p style={{ marginBottom: 10 }}>
                Okänd streckkod <span className="mono">{pending.barcode}</span>. Vad är det för vara?
              </p>
              <input autoFocus value={pending.name}                 onChange={e => setPending(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveUnknown()} />
              <div className="grid-2">
                <button className="btn-ghost" onClick={hoppaOver}>Hoppa över</button>
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

function Owned({ items, barcode, onConsumeOne }) {
  const owned = alreadyHome(items, barcode);
  if (!owned.length) return null;

  // Den som går ut först är den man äter upp härnäst, så det är den som räknas
  // ner. Sista exemplaret markeras som slut i stället — det är ett annat besked.
  const next = owned[0];
  const total = totalCount(owned);

  return (
    <div className="owned">
      <div className="owned-text">
        <h3>Redan hemma</h3>
        <div className="owned-where">{summarize(owned)}</div>
      </div>
      <button className="btn-ghost btn-pill" onClick={() => onConsumeOne(next)}>
        {total > 1 ? `Ta en ur ${locationLabel(next.location).toLowerCase()}` : 'Markera som slut'}
      </button>
    </div>
  );
}

function ManualRow({ onCancel, onSubmit }) {
  const [name, setName] = useState('');
  return (
    <div className="scan-toast" style={{ display: 'block' }}>
      <input autoFocus value={name} placeholder="Varans namn"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit(name)} />
      <div className="grid-2">
        <button className="btn-ghost" onClick={onCancel}>Avbryt</button>
        <button onClick={() => onSubmit(name)} disabled={!name.trim()}>Lägg till</button>
      </div>
    </div>
  );
}
