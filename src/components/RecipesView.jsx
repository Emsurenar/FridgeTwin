import { useState } from 'react';
import { ChefHat, Clock, Loader2, RefreshCw } from 'lucide-react';
import { suggestRecipes } from '../lib/ai';
import { expiryState, isUrgent } from '../lib/expiry';

/*
  Förslagen hämtas bara när man ber om dem. Ett automatiskt anrop vid varje
  sidladdning hade bränt tokens på en fråga användaren inte ställt.
*/
export default function RecipesView({ items, aiOk, onToast, onGoToSettings }) {
  const [recipes, setRecipes] = useState(null);
  const [busy, setBusy] = useState(false);

  const urgent = items.filter(i => isUrgent(expiryState(i.expiresOn)));

  const run = async () => {
    setBusy(true);
    try {
      setRecipes(await suggestRecipes(items));
    } catch (e) {
      onToast(e.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Vad kan jag laga?</h1>
      <p style={{ marginBottom: 'var(--space-5)' }}>
        {urgent.length
          ? `Förslagen utgår från lagret och prioriterar ${urgent.map(i => i.name.toLowerCase()).slice(0, 3).join(', ')}.`
          : 'Förslagen utgår från vad som finns hemma just nu.'}
      </p>

      {!aiOk && (
        <div className="panel">
          <p style={{ marginBottom: 12 }}>Receptförslag kräver en Anthropic-nyckel.</p>
          <button className="btn-ghost" onClick={onGoToSettings}>Öppna inställningar</button>
        </div>
      )}

      {aiOk && (
        <button onClick={run} disabled={busy || !items.length} className={recipes ? 'btn-ghost' : ''}>
          {busy ? <Loader2 size={17} className="spin" /> : recipes ? <RefreshCw size={16} /> : <ChefHat size={17} />}
          {busy ? 'Tänker…' : recipes ? 'Nya förslag' : 'Föreslå rätter'}
        </button>
      )}

      {!items.length && <p style={{ marginTop: 16 }}>Lagret är tomt — skanna in något först.</p>}

      <div style={{ marginTop: 'var(--space-5)' }}>
        {recipes?.map((r, i) => (
          <div key={i} className="panel recipe-card">
            <div className="flex-between" style={{ marginBottom: 6 }}>
              <h2 className="truncate">{r.title}</h2>
              <span className="item-sub flex-row" style={{ gap: 4, flexShrink: 0 }}>
                <Clock size={13} /> {r.minutes} min
              </span>
            </div>
            <p style={{ marginBottom: 12 }}>{r.why}</p>

            <div style={{ marginBottom: 10 }}>
              {r.uses?.map(u => <span key={u} className="tag">{u}</span>)}
              {r.missing?.map(m => <span key={m} className="tag tag-missing">saknas: {m}</span>)}
            </div>

            <ol style={{ paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.7 }}>
              {r.steps?.map((s, j) => <li key={j}>{s}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </>
  );
}
