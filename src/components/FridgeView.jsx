import { useMemo, useState } from 'react';
import { Package, Search, Plus, X, Snowflake, Check, Trash2, CalendarPlus } from 'lucide-react';
import { byExpiry, expiryState } from '../lib/expiry';
import { queueSections } from '../lib/rail';
import { fmtBandExpiry, fmtToday, locationGlyph, locationLabel, monogram } from '../lib/fmt';
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

// Bild när det finns en, annars monogram. Paketikonen är kvar bara för varor
// vars namn inte ger någon bokstav alls.
function Thumb({ item, size }) {
  const mark = monogram(item.name);
  return (
    <div className="band-img" style={{ width: size, height: size }}>
      {item.imageUrl
        ? <img src={item.imageUrl} alt="" loading="lazy" />
        : mark === '?'
        ? <Package size={Math.round(size * 0.42)} strokeWidth={1.4} />
        : <span className="band-mono" style={{ fontSize: Math.round(size * 0.34) }}>{mark}</span>}
    </div>
  );
}

// Raden säger var varan ligger och hur många det är — det som inte får plats i
// namnet men avgör om man går till frysen eller kylen.
function Meta({ item }) {
  return (
    <span className="band-meta">
      <span className="band-glyph" title={locationLabel(item.location)}>
        {locationGlyph(item.location)}
      </span>
      {item.count > 1 && <span className="band-count">{item.count} st</span>}
    </span>
  );
}

/*
  Bandet: en vara som kräver ett beslut. Passerat får två knappar för att det
  bara finns två sanningar om utgången mat. Brådskande får "Frys in", för de tre
  utrymmena är egentligen tre hastigheter på förfall — att frysa in är att pausa
  klockan, och det är en räddning och inte en flytt.
*/
function Band({ item, onSelect, onRemove, onFreeze }) {
  const state = expiryState(item.expiresOn);
  const passerat = state === 'expired';

  return (
    <article id={`vara-${item.id}`} className={`band band-${state}`}>
      <button type="button" className="band-head" onClick={() => onSelect(item)}>
        <Thumb item={item} size={passerat ? 56 : 48} />
        <span className="band-text">
          <span className="band-name">{item.name}</span>
          <span className="band-when">{fmtBandExpiry(item.expiresOn)}</span>
        </span>
        <Meta item={item} />
      </button>

      <div className="band-actions">
        {passerat ? (
          <>
            <button className="act act-warm" onClick={() => onRemove(item, 'waste')}>
              <Trash2 size={15} /> Slängd
            </button>
            <button className="act" onClick={() => onRemove(item, 'consumed')}>
              <Check size={15} /> Åt ändå
            </button>
          </>
        ) : (
          <>
            {item.location !== 'freezer' && (
              <button className="act" onClick={() => onFreeze(item)}>
                <Snowflake size={15} /> Frys in
              </button>
            )}
            <button className="act" onClick={() => onRemove(item, 'consumed')}>
              <Check size={15} /> Slut
            </button>
            <button className="act act-warm" onClick={() => onRemove(item, 'waste')}>
              <Trash2 size={15} /> Slängd
            </button>
          </>
        )}
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
        <Thumb item={item} size={32} />
        <span className="row-name">{item.name}</span>
        <Meta item={item} />
      </button>
      {action || <span className="row-when">{fmtBandExpiry(item.expiresOn)}</span>}
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
      <div className="topbar">
        <span className="topbar-date">{fmtToday()}</span>
        <div className="topbar-actions">
          <button className="btn-icon" aria-label={searching ? 'Stäng sök' : 'Sök vara'}
            onClick={() => { setSearching(s => !s); setQuery(''); }}>
            {searching ? <X size={20} /> : <Search size={20} />}
          </button>
          <button className="btn-round-accent" onClick={onAddClick} aria-label="Lägg till vara">
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {searching && (
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Sök i hela kylskåpet" />
      )}

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
          <Rail items={items} onPick={scrollTo} />

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
        </>
      )}
    </>
  );
}
