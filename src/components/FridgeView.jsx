import { useMemo, useState } from 'react';
import { Package, Search, Plus, X, CalendarPlus } from 'lucide-react';
import { byExpiry, expiryState } from '../lib/expiry';
import { queueSections } from '../lib/rail';
import { lagesText } from '../lib/lage';
import { fmtBandExpiry, fmtToday, locationLabel } from '../lib/fmt';

/*
  Kylskåpet.

  Tid är ordningsprincipen, inte plats: allt som brådskar i kyl, frys och
  skafferi står i samma lista, och utrymmet är en upplysning på raden. Det var
  rätt i förra omgången och står kvar.

  Det som ändrats är tonen. Vyn var en instrumentpanel — svart block, staplar,
  spärrade versaler i monospace, tre ikonknappar per rad. Den läste som ett
  verktyg för någon som analyserar sitt kylskåp, inte som något man plockar upp
  i köket. Nu: en mening som säger läget, och lugna kort under.

  Besluten flyttade till varans kort. Femton grå ikoner nedför en lista var
  brus, och "slängd" respektive "slut" förtjänar riktiga etiketter — det är
  skillnaden mellan svinnstatistik som stämmer och en som inte gör det.
*/

function Bild({ item, size = 46 }) {
  return (
    <div className="rad-bild" style={{ width: size, height: size }}>
      {item.imageUrl
        ? <img src={item.imageUrl} alt="" loading="lazy" />
        : <Package size={Math.round(size * 0.4)} strokeWidth={1.5} />}
    </div>
  );
}

// Underraden: antal och plats. Nedräkningen sitter i pillret till höger, så
// den upprepas inte här.
function under(item) {
  const delar = [];
  if (item.count > 1) delar.push(`${item.count} st`);
  delar.push(locationLabel(item.location));
  if (item.brand) delar.push(item.brand);
  return delar.join(' · ');
}

function Rad({ item, onSelect, atgard }) {
  const state = expiryState(item.expiresOn);
  return (
    <button type="button" id={`vara-${item.id}`} className="rad" onClick={() => onSelect(item)}>
      <Bild item={item} />
      <span className="rad-text">
        <span className="rad-namn">{item.name}</span>
        <span className="rad-under">{under(item)}</span>
      </span>
      {atgard || (
        <span className={`dagar dagar-${state}`}>{fmtBandExpiry(item.expiresOn)}</span>
      )}
    </button>
  );
}

const Grupp = ({ titel, antal, children }) => (
  <section className="grupp">
    <h2 className="grupp-titel">{titel}<span className="grupp-antal">{antal}</span></h2>
    <div className="kort">{children}</div>
  </section>
);

/*
  Håller sig: brickor i stället för rader. Här är frågan "har jag senap hemma",
  inte "vad ska jag äta", och då räcker namnet — och då är utrymmet rätt
  ordningsprincip igen.
*/
function Forrad({ items, onSelect }) {
  const perPlats = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.location)) map.set(item.location, []);
      map.get(item.location).push(item);
    }
    return [...map].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  return (
    <section className="grupp">
      <h2 className="grupp-titel">Håller sig<span className="grupp-antal">{items.length}</span></h2>
      {perPlats.map(([location, list]) => (
        <div key={location} className="forrad">
          <div className="forrad-plats">{locationLabel(location)}</div>
          <div className="brickor">
            {list.map(item => (
              <button key={item.id} id={`vara-${item.id}`} className="bricka"
                onClick={() => onSelect(item)}>
                {item.name}
                {item.count > 1 && <span className="bricka-antal">{item.count}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/*
  Filtret. Tid är fortfarande ordningsprincipen — grupperingen ändras inte — men
  ibland är frågan "vad har jag i frysen", och då ska man slippa läsa förbi
  kylens allt. "Allt" är förvalt, så tidsaxeln är kvar som utgångsläge.
*/
const FILTER = [
  { id: 'all', label: 'Allt' },
  { id: 'fridge', label: 'Kyl' },
  { id: 'freezer', label: 'Frys' },
  { id: 'pantry', label: 'Skafferi' },
];

export default function FridgeView({ items, loading, error, onRetry, onSelect, onAddClick }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [plats, setPlats] = useState('all');

  const q = query.trim().toLowerCase();
  const synliga = useMemo(
    () => (plats === 'all' ? items : items.filter(i => i.location === plats)),
    [items, plats]);

  // Sökningen går tvärs allt — letar man efter senapen vill man inte först
  // behöva gissa vilket utrymme den står i.
  const hits = useMemo(() => {
    if (!q) return null;
    return items
      .filter(i => i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q))
      .sort(byExpiry);
  }, [items, q]);

  const { attGora, veckan, utanDatum, resten } = useMemo(() => {
    const s = queueSections(synliga);
    return {
      attGora: s.attGora.sort(byExpiry),
      veckan: s.veckan.sort(byExpiry),
      utanDatum: s.utanDatum,
      resten: s.resten.sort(byExpiry),
    };
  }, [synliga]);

  // Meningen speglar det man tittar på. Filtrerar man till frysen ska den säga
  // frysens läge, inte hela kylskåpets.
  const lage = useMemo(() => lagesText(synliga), [synliga]);

  if (loading && !items.length) return <p className="tomt">Öppnar kylskåpet…</p>;
  if (error && !items.length) {
    return (
      <div className="tomt">
        <p style={{ marginBottom: 16 }}>Kunde inte hämta lagret.<br />{error}</p>
        <button className="btn-ghost btn-pill" onClick={onRetry}>Försök igen</button>
      </div>
    );
  }

  return (
    <>
      <header className="topp">
        <div className="topp-rad">
          <button className="topp-rund" aria-label={searching ? 'Stäng sök' : 'Sök vara'}
            onClick={() => { setSearching(s => !s); setQuery(''); }}>
            {searching ? <X size={19} /> : <Search size={19} />}
          </button>
          <button className="topp-rund topp-rund-primar" onClick={onAddClick}
            aria-label="Lägg till vara">
            <Plus size={20} strokeWidth={2.4} />
          </button>
        </div>

        {!searching && (
          <h1 className={`lage lage-${lage.ton}`}>
            {lage.tal !== undefined && <><span className="lage-tal">{lage.tal}</span>{' '}</>}
            {lage.text}
          </h1>
        )}
      </header>

      {searching && (
        <input className="sok-falt" autoFocus value={query}
          aria-label="Sök i hela kylskåpet"
          placeholder="Sök i hela kylskåpet"
          onChange={e => setQuery(e.target.value)} />
      )}

      {!searching && items.length > 0 && (
        <div className="segmented platsfilter" role="group" aria-label="Visa utrymme">
          {FILTER.map(f => (
            <button key={f.id} className={plats === f.id ? 'active' : ''}
              aria-pressed={plats === f.id} onClick={() => setPlats(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {hits ? (
        hits.length
          ? <Grupp titel={hits.length === 1 ? 'Träff' : 'Träffar'} antal={hits.length}>
              {hits.map(item => <Rad key={item.id} item={item} onSelect={onSelect} />)}
            </Grupp>
          : <p className="tomt">Ingen vara heter så.</p>
      ) : !items.length ? (
        <div className="tomt">
          <p>Skanna en streckkod eller tryck på plus.</p>
        </div>
      ) : !synliga.length ? (
        <p className="tomt">Inget här ännu.</p>
      ) : (
        <>
          {attGora.length > 0 && (
            <Grupp titel="Ät nu" antal={attGora.length}>
              {attGora.map(item => <Rad key={item.id} item={item} onSelect={onSelect} />)}
            </Grupp>
          )}

          {veckan.length > 0 && (
            <Grupp titel="Den här veckan" antal={veckan.length}>
              {veckan.map(item => <Rad key={item.id} item={item} onSelect={onSelect} />)}
            </Grupp>
          )}

          {/* Utan datum var tidigare osynligt: raden föll tillbaka på mängden
              och såg likadan ut som en vara med full koll. Sortering,
              gruppering och receptprioritering hänger alla på att det blir
              ifyllt, så frånvaron är ett hål man lagar med ett tryck. */}
          {utanDatum.length > 0 && (
            <Grupp titel="Utan datum" antal={utanDatum.length}>
              {utanDatum.map(item => (
                <Rad key={item.id} item={item} onSelect={onSelect}
                  atgard={
                    <span className="satt-datum" role="presentation">
                      <CalendarPlus size={14} /> Sätt datum
                    </span>
                  } />
              ))}
            </Grupp>
          )}

          {resten.length > 0 && <Forrad items={resten} onSelect={onSelect} />}

          <footer className="summa">
            {fmtToday()} · {synliga.length} {synliga.length === 1 ? 'vara' : 'varor'}
            {plats !== 'all' && ` av ${items.length}`}
          </footer>
        </>
      )}
    </>
  );
}
