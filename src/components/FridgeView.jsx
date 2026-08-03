import { useMemo, useState } from 'react';
import { Package, Search, Plus, X, Snowflake, Check, Trash2, CalendarPlus } from 'lucide-react';
import { byExpiry, expiryState } from '../lib/expiry';
import { queueSections } from '../lib/rail';
import { fmtBandExpiry, fmtToday, locationLabel, monogram } from '../lib/fmt';
import Rail from './Rail';

/*
  Kön, inte skåpet.

  Den gamla vyn ritade en möbel: tre luckor som segmentkontroll, en låda med
  hyllor, och ett rutnät av lika stora rutor. Den kostade ~290 px krom som aldrig
  ändrades, och den kunde inte svara på appens viktigaste fråga — vad brådskar? —
  utan att man öppnade en lucka i taget och la ihop svaret i huvudet.

  Nu är den lodräta axeln tid och plats bara en bokstav på raden. Allt som
  brådskar i kyl, frys och skafferi står i samma lista, och skärmytan fördelas
  efter hur mycket varan förtjänar: ett passerat band är 112 px med två beslut,
  en vara som håller sig är en 30 px bricka. Över sju dagar syns inte i kön alls.
*/

/*
  Bild när det finns en, annars monogram.

  Brickan tonas efter brådska. Tidigare låg brådskan i en 3px färgstapel längst
  ut i vänsterkanten — en grov markör som fick kön att se ut som en
  uppgiftslista. Nu bär brickan informationen i stället, och den var ändå det
  enda elementet på raden som inte gjorde något.
*/
function Thumb({ item, size }) {
  const mark = monogram(item.name);
  const state = expiryState(item.expiresOn);
  return (
    <div className={`band-img img-${state}`} style={{ width: size, height: size }}>
      {item.imageUrl
        ? <img src={item.imageUrl} alt="" loading="lazy" />
        : mark === '?'
        ? <Package size={Math.round(size * 0.42)} strokeWidth={1.4} />
        : <span className="band-mono" style={{ fontSize: Math.round(size * 0.34) }}>{mark}</span>}
    </div>
  );
}

/*
  Underraden: nedräkning, antal och plats på en rad i stället för i var sin ruta
  på höjden. Platsen skrivs ut — "Kylen" läses direkt medan ett K i en grå ruta
  är en kod man måste lära sig, och den rutan var dessutom egen visuell möbel.
*/
function Under({ item, when }) {
  const bitar = [];
  if (when) bitar.push(when);
  if (item.count > 1) bitar.push(`${item.count} st`);
  bitar.push(locationLabel(item.location));

  /*
    Skiljetecknet är ett riktigt tecken, inte ett tomt element med bakgrundsfärg.
    Blink och WebKit lägger inte in blanksteg mellan inline-syskon när ett
    tillgängligt namn räknas ut, så prickelementet gav uppläsningen
    "om 3 dagar2 stKylen" — två sammanslagna ord där skärmen visar tre delar.
  */
  return <span className="band-when">{bitar.join(' · ')}</span>;
}

/*
  Bandet: en vara som kräver ett beslut.

  Besluten är ikoner och inte fullbreda knappar. Tre etiketterade knappar per
  band gav femton grå rektanglar på en skärm och tvingade ner bandet till
  ~150 px — man såg två beslut åt gången i en vy vars hela syfte är att visa
  alla. Nu är bandet en rad på 68 px och samma skärm rymmer sju. De etiketterade
  varianterna finns kvar ett tryck bort, i varans eget kort.

  Frys in är räddningen: de tre utrymmena är tre hastigheter på förfall, och att
  frysa in är att pausa klockan.
*/
function Band({ item, onSelect, onRemove, onFreeze }) {
  const state = expiryState(item.expiresOn);

  return (
    <article id={`vara-${item.id}`} className={`band band-${state}`}>
      <button type="button" className="band-head" onClick={() => onSelect(item)}>
        <Thumb item={item} size={44} />
        <span className="band-text">
          <span className="band-name">{item.name}</span>
          <Under item={item} when={fmtBandExpiry(item.expiresOn)} />
        </span>
      </button>

      <div className="band-actions">
        {item.location !== 'freezer' && state !== 'expired' && (
          <button className="ikon-act" onClick={() => onFreeze(item)}
            aria-label={`Frys in ${item.name}`}>
            <Snowflake size={17} />
          </button>
        )}
        <button className="ikon-act" onClick={() => onRemove(item, 'consumed')}
          aria-label={`${item.name} är uppäten`}>
          <Check size={17} />
        </button>
        <button className="ikon-act ikon-act-warm" onClick={() => onRemove(item, 'waste')}
          aria-label={`Släng ${item.name}`}>
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

// Veckans varor kräver inget beslut i dag — de ska gå att överblicka, inte
// hanteras. Därför en rad utan knappar.
function Row({ item, onSelect, action }) {
  return (
    <div id={`vara-${item.id}`} className="row">
      <button type="button" className="row-head" onClick={() => onSelect(item)}>
        <Thumb item={item} size={34} />
        <span className="row-text">
          <span className="row-name">{item.name}</span>
          <Under item={item} when={action ? null : fmtBandExpiry(item.expiresOn)} />
        </span>
      </button>
      {action}
    </div>
  );
}

/*
  Resten: det som håller sig. Här är frågan inte "vad ska jag äta" utan "har jag
  senap hemma", och då är utrymmet rätt ordningsprincip igen.
*/
function Stash({ items, onSelect }) {
  const perPlats = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.location)) map.set(item.location, []);
      map.get(item.location).push(item);
    }
    return [...map].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <div className="stash">
      {perPlats.map(([location, list]) => (
        <div key={location} className="stash-group">
          <h3 className="stash-head">{locationLabel(location)} <span>{list.length}</span></h3>
          <div className="stash-chips">
            {list.map(item => (
              <button key={item.id} id={`vara-${item.id}`} className="chip-item"
                onClick={() => onSelect(item)}>
                {item.name}
                {item.count > 1 && <span className="chip-count">{item.count}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Eyebrow = ({ children, n }) => (
  <h3 className="eyebrow">{children}{n !== undefined && <span className="eyebrow-n">{n}</span>}</h3>
);

export default function FridgeView({ items, loading, error, onRetry, onSelect, onAddClick, onRemove, onFreeze }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const q = query.trim().toLowerCase();

  // Sökningen går tvärs allt — letar man efter senapen vill man inte först
  // behöva gissa vilket utrymme den står i.
  const hits = useMemo(() => {
    if (!q) return null;
    return items
      .filter(i => i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q))
      .sort(byExpiry);
  }, [items, q]);

  const { attGora, veckan, utanDatum, resten } = useMemo(() => {
    const s = queueSections(items);
    return {
      attGora: s.attGora.sort(byExpiry),
      veckan: s.veckan.sort(byExpiry),
      utanDatum: s.utanDatum,
      resten: s.resten.sort(byExpiry),
    };
  }, [items]);

  const scrollTo = (item) => {
    document.getElementById(`vara-${item.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (loading && !items.length) return <p className="tomt">Öppnar kylskåpet…</p>;
  if (error && !items.length) {
    return (
      <div className="tomt">
        <p style={{ marginBottom: 14 }}>Kunde inte hämta lagret.<br />{error}</p>
        <button className="btn-ghost btn-pill" onClick={onRetry}>Försök igen</button>
      </div>
    );
  }

  return (
    <>
      {/*
        Instrumentpanelen: datum, sök, lägg till och streckkoden i ett mörkt
        block. Tidigare svävade den mörka raden ensam mitt i en ljus sida och
        läste som en rand; nu har appen en arkitektonisk topp — ett mörkt
        instrument och en ljus arbetsyta — och det är den enda mörka ytan i hela
        appen.
      */}
      <div className="instrument">
        <div className="instrument-head">
          <span className="instrument-date">{fmtToday()}</span>
          <div className="instrument-actions">
            <button className="ikon-mork" aria-label={searching ? 'Stäng sök' : 'Sök vara'}
              onClick={() => { setSearching(s => !s); setQuery(''); }}>
              {searching ? <X size={19} /> : <Search size={19} />}
            </button>
            <button className="ikon-mork ikon-primar" onClick={onAddClick} aria-label="Lägg till vara">
              <Plus size={19} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {searching ? (
          <input className="instrument-sok" autoFocus value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Sök i hela kylskåpet"
            placeholder="Sök i hela kylskåpet" />
        ) : items.length > 0 && <Rail items={items} onPick={scrollTo} />}
      </div>

      {hits ? (
        <>
          <Eyebrow n={hits.length}>{hits.length === 1 ? 'träff' : 'träffar'}</Eyebrow>
          {hits.length
            ? hits.map(item => <Row key={item.id} item={item} onSelect={onSelect} />)
            : <p className="tomt">Ingen vara heter så.</p>}
        </>
      ) : !items.length ? (
        <div className="tomt">
          <p>Kylskåpet är tomt.<br />Tryck på plusknappen eller skanna en streckkod.</p>
        </div>
      ) : (
        <>
          {attGora.length > 0 && (
            <section>
              <Eyebrow n={attGora.length}>Att göra</Eyebrow>
              {attGora.map(item => (
                <Band key={item.id} item={item} onSelect={onSelect}
                  onRemove={onRemove} onFreeze={onFreeze} />
              ))}
            </section>
          )}

          {veckan.length > 0 && (
            <section>
              <Eyebrow n={veckan.length}>Den här veckan</Eyebrow>
              {veckan.map(item => <Row key={item.id} item={item} onSelect={onSelect} />)}
            </section>
          )}

          {/* Utan datum var tidigare osynligt: rutan föll tillbaka på mängden och
              såg likadan ut som en vara med full koll. Nu är frånvaron ett hål
              man lagar med ett tryck — och sorteringen, hyllindelningen och
              receptprioriteringen hänger alla på att det blir lagat. */}
          {utanDatum.length > 0 && (
            <section>
              <Eyebrow n={utanDatum.length}>Utan datum</Eyebrow>
              {utanDatum.map(item => (
                <Row key={item.id} item={item} onSelect={onSelect}
                  action={
                    <button className="act act-date" onClick={() => onSelect(item)}>
                      <CalendarPlus size={14} /> Sätt datum
                    </button>
                  } />
              ))}
            </section>
          )}

          {resten.length > 0 && (
            <section>
              <Eyebrow n={resten.length}>Håller sig</Eyebrow>
              <Stash items={resten} onSelect={onSelect} />
            </section>
          )}

          {!attGora.length && !veckan.length && (
            <p className="lugnt">Inget brådskar den närmaste veckan.</p>
          )}

          {/* Sidan behöver ett slut. Totalen står här och inte överst: den
              besvarar ingen fråga man har när man öppnar appen, men den svarar
              på "var det allt?" när man skrollat färdigt. */}
          <footer className="summa">
            {[`${items.length} varor`, utanDatum.length && `${utanDatum.length} utan datum`]
              .filter(Boolean).join(' · ')}
          </footer>
        </>
      )}
    </>
  );
}
