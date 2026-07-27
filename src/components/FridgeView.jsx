import { useMemo, useState } from 'react';
import { Package, Search, Plus, X, Refrigerator, Snowflake, Archive } from 'lucide-react';
import { byExpiry, expiryState, isUrgent, shelfOf, SHELVES } from '../lib/expiry';
import { fmtExpiryShort, locationLabel } from '../lib/fmt';

/*
  Kylskåpet, inte listan.

  Två saker gjorde den gamla listan rörig när lagret växte: allt låg i ett enda
  svep, och den enda ordningen var utgångsdatum. Här öppnar man ett utrymme i
  taget (kyl, frys, skafferi) och ser innehållet ställt på hyllor efter hur
  bråttom det är. Det tredelar innehållet på skärmen och matchar hur man
  faktiskt letar: man öppnar en lucka och tittar på en hylla.

  Rutorna är bildförst och tre i bredd, så tjugo varor får plats utan att bli
  en skrollrulle. Namnet räcker för att känna igen en vara man själv ställt in;
  detaljerna finns ett tryck bort.
*/

const DOORS = [
  { id: 'fridge', label: 'Kylen', icon: Refrigerator },
  { id: 'freezer', label: 'Frysen', icon: Snowflake },
  { id: 'pantry', label: 'Skafferiet', icon: Archive },
];

const EMPTY_TEXT = {
  fridge: 'Kylen är tom.',
  freezer: 'Frysen är tom.',
  pantry: 'Skafferiet är tomt.',
};

function Tile({ item, onClick, showLocation }) {
  const state = expiryState(item.expiresOn);
  const urgent = isUrgent(state);
  // I en sökning är svaret på "var ligger den?" halva poängen med att söka.
  const sub = showLocation
    ? locationLabel(item.location)
    : item.quantity || fmtExpiryShort(item.expiresOn) || '';

  return (
    <button className={`tile ${urgent ? `tile-${state}` : ''}`} onClick={onClick}>
      <div className="tile-img">
        {item.imageUrl
          ? <img src={item.imageUrl} alt="" loading="lazy" />
          : <Package size={22} strokeWidth={1.5} />}
        {item.count > 1 && <span className="tile-count">{item.count}</span>}
      </div>
      <span className="tile-name">{item.name}</span>
      {urgent && !showLocation
        ? <span className={`tile-expiry expiry-${state}`}>{fmtExpiryShort(item.expiresOn)}</span>
        : <span className="tile-sub">{sub}</span>}
    </button>
  );
}

function Shelf({ label, items, onSelect }) {
  if (!items.length) return null;
  return (
    <div className="shelf">
      <div className="shelf-head">
        <h3>{label}</h3>
        <span className="shelf-count">{items.length}</span>
      </div>
      <div className="shelf-items">
        {items.map(item => <Tile key={item.id} item={item} onClick={() => onSelect(item)} />)}
      </div>
      <div className="shelf-edge" />
    </div>
  );
}

export default function FridgeView({ items, loading, onSelect, onAddClick }) {
  const [door, setDoor] = useState('fridge');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Räknas per lucka, så man ser att frysen behöver uppmärksamhet utan att öppna den.
  const doorStats = useMemo(() => {
    const stats = {};
    for (const d of DOORS) {
      const mine = items.filter(i => i.location === d.id);
      stats[d.id] = {
        count: mine.reduce((n, i) => n + i.count, 0),
        urgent: mine.some(i => isUrgent(expiryState(i.expiresOn))),
      };
    }
    return stats;
  }, [items]);

  const q = query.trim().toLowerCase();

  // Sökning går tvärs genom alla utrymmen — letar man efter senapen vill man
  // inte först behöva gissa vilken lucka den står i.
  const hits = useMemo(() => {
    if (!q) return null;
    return items
      .filter(i => i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q))
      .sort(byExpiry);
  }, [items, q]);

  const shelves = useMemo(() => {
    const inDoor = items.filter(i => i.location === door).sort(byExpiry);
    return SHELVES.map(s => ({ ...s, items: inDoor.filter(i => shelfOf(i) === s.id) }));
  }, [items, door]);

  const total = items.reduce((n, i) => n + i.count, 0);
  const doorEmpty = shelves.every(s => !s.items.length);

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="truncate">
          <h1>Kylskåpet</h1>
          <p style={{ fontSize: '0.85rem' }}>
            {total ? `${total} varor hemma` : 'Inget inskannat än'}
          </p>
        </div>
        <div className="flex-row" style={{ gap: 6 }}>
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
        <div className="fridge">
          {hits.length
            ? (
              <div className="shelf">
                <div className="shelf-head">
                  <h3>{hits.length === 1 ? '1 träff' : `${hits.length} träffar`}</h3>
                </div>
                <div className="shelf-items">
                  {hits.map(item => (
                    <Tile key={item.id} item={item} showLocation onClick={() => onSelect(item)} />
                  ))}
                </div>
                <div className="shelf-edge" />
              </div>
            )
            : <p className="fridge-empty">Ingen vara heter så.</p>}
        </div>
      ) : (
        <>
          <div className="doors">
            {DOORS.map(d => (
              <button key={d.id} className={`door ${door === d.id ? 'open' : ''}`}
                onClick={() => setDoor(d.id)} aria-pressed={door === d.id}>
                <d.icon size={17} strokeWidth={1.8} />
                <span>{d.label}</span>
                <span className="door-count">
                  {doorStats[d.id].count}
                  {doorStats[d.id].urgent && <i className="door-dot" aria-label="något brådskar" />}
                </span>
              </button>
            ))}
          </div>

          {/* key på luckan: innehållet monteras om vid byte, så ljuset tänds igen */}
          <div className="fridge" key={door}>
            {/* Tomt och "inte hämtat än" ser likadant ut i datan men betyder helt
                olika saker — utan det här står det "Kylen är tom" varje gång
                appen startar, en halvsekund innan varorna dyker upp. */}
            {loading && !items.length
              ? <p className="fridge-empty">Öppnar kylskåpet…</p>
              : doorEmpty
              ? (
                <p className="fridge-empty">
                  {EMPTY_TEXT[door]}<br />
                  {items.length ? 'Skanna in något, eller kolla en annan lucka.' : 'Tryck på plusknappen eller skanna en streckkod.'}
                </p>
              )
              : shelves.map(s => (
                <Shelf key={s.id} label={s.label} items={s.items} onSelect={onSelect} />
              ))}
          </div>

        </>
      )}
    </>
  );
}
