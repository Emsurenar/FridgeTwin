import { useMemo, useState } from 'react';
import { Package, AlertTriangle, Camera, Search, RefreshCw } from 'lucide-react';
import { byExpiry, expiryState, expirySummary, isUrgent } from '../lib/expiry';
import { fmtExpiry, LOCATIONS, locationLabel } from '../lib/fmt';

const EDGE = {
  expired: 'var(--danger)',
  today: 'var(--danger)',
  soon: 'var(--warn)',
};

function ItemRow({ item, onClick }) {
  const state = expiryState(item.expiresOn);
  const expiry = fmtExpiry(item.expiresOn);
  const sub = [item.brand, item.quantity].filter(Boolean).join(' · ');

  return (
    <div className="item-row" style={{ '--edge': EDGE[state] || 'transparent' }}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="thumb">
        {item.imageUrl
          ? <img src={item.imageUrl} alt="" width={44} height={44} style={{ objectFit: 'contain' }} loading="lazy" />
          : <Package size={18} />}
      </div>
      <div className="truncate" style={{ flex: 1 }}>
        <div className="item-name truncate">{item.name}</div>
        <div className="item-sub truncate">{sub || locationLabel(item.location)}</div>
      </div>
      {item.count > 1 && <span className="count-badge">{item.count}</span>}
      {expiry && <span className={`expiry-pill expiry-${state}`}>{expiry}</span>}
    </div>
  );
}

export default function InventoryView({ items, loading, onSelect, onOpenPhoto, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const summary = useMemo(() => expirySummary(items), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(i => filter === 'all' || (filter === 'urgent' ? isUrgent(expiryState(i.expiresOn)) : i.location === filter))
      .filter(i => !q || i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q))
      .sort(byExpiry);
  }, [items, filter, query]);

  // Grupperas per plats — men bara i "Allt", annars är rubriken bara brus.
  const groups = useMemo(() => {
    if (filter !== 'all') return [{ id: null, label: null, items: shown }];
    return LOCATIONS
      .map(l => ({ id: l.id, label: l.label, items: shown.filter(i => i.location === l.id) }))
      .filter(g => g.items.length);
  }, [shown, filter]);

  return (
    <>
      <div className="flex-between" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <h1>Kylskåpet</h1>
          <p style={{ fontSize: '0.85rem' }}>
            {items.length ? `${items.reduce((n, i) => n + i.count, 0)} varor hemma` : 'Inget inskannat än'}
          </p>
        </div>
        <div className="flex-row" style={{ gap: 0 }}>
          <button className="btn-icon" onClick={onOpenPhoto} aria-label="Identifiera med foto">
            <Camera size={20} />
          </button>
          <button className="btn-icon" onClick={onRefresh} aria-label="Uppdatera">
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {(summary.expired > 0 || summary.urgent > 0) && (
        <div className={`banner ${summary.expired ? 'banner-danger' : 'banner-warn'}`}>
          <AlertTriangle size={17} />
          <span>{[
            summary.expired && `${summary.expired} ${summary.expired === 1 ? 'vara' : 'varor'} har passerat bäst före`,
            // "vara/varor" bara i första ledet — annars blir meningen stapplande.
            summary.urgent && (summary.expired
              ? `${summary.urgent} går ut inom tre dagar`
              : `${summary.urgent} ${summary.urgent === 1 ? 'vara' : 'varor'} går ut inom tre dagar`),
          ].filter(Boolean).join(', ')}.</span>
        </div>
      )}

      {items.length > 6 && (
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: 17, color: 'var(--text-muted)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Sök vara" style={{ paddingLeft: 40 }} />
        </div>
      )}

      <div className="segmented">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Allt</button>
        <button className={filter === 'urgent' ? 'active' : ''} onClick={() => setFilter('urgent')}>Brådskar</button>
        {LOCATIONS.map(l => (
          <button key={l.id} className={filter === l.id ? 'active' : ''} onClick={() => setFilter(l.id)}>{l.label}</button>
        ))}
      </div>

      {!shown.length && (
        <div className="empty-state">
          <Package size={30} style={{ marginBottom: 12 }} />
          <h2>{items.length ? 'Inget här' : 'Tomt kylskåp'}</h2>
          <p>{items.length
            ? 'Ingen vara matchar filtret.'
            : 'Tryck på skannerknappen och rikta kameran mot en streckkod.'}</p>
        </div>
      )}

      {groups.map(group => (
        <div key={group.id || 'alla'} style={{ marginBottom: 'var(--space-5)' }}>
          {group.label && <h3 style={{ marginBottom: 8 }}>{group.label}</h3>}
          <div className="stack">
            {group.items.map(item => (
              <ItemRow key={item.id} item={item} onClick={() => onSelect(item)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
