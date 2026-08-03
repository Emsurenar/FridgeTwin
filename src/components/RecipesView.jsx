import { useState } from 'react';
import { ChefHat, Clock, Loader2, X } from 'lucide-react';
import { MEALS, mealLabel } from '../lib/ai';
import { expiryState, isUrgent } from '../lib/expiry';
import { fmtLogTime } from '../lib/fmt';

/*
  Förslagen hämtas bara när man ber om dem — ett automatiskt anrop vid varje
  sidladdning hade bränt tokens på en fråga användaren inte ställt.

  Själva körningen och loggen bor i App, inte här. Vyn avmonteras vid varje
  flikbyte, och tidigare tog den både pågående anrop och färdiga förslag med
  sig i fallet: tryckte man "Föreslå rätter" och gick till kylskåpet under tiden
  var allt borta när man kom tillbaka.
*/
function Recipe({ recipe }) {
  return (
    <div className="panel recipe-card">
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <h2 className="truncate">{recipe.title}</h2>
        <span className="item-sub flex-row" style={{ gap: 4, flexShrink: 0 }}>
          <Clock size={13} /> {recipe.minutes} min
        </span>
      </div>
      <p style={{ marginBottom: 12 }}>{recipe.why}</p>

      <div style={{ marginBottom: 10 }}>
        {recipe.uses?.map(u => <span key={u} className="tag">{u}</span>)}
        {recipe.missing?.map(m => <span key={m} className="tag tag-missing">saknas: {m}</span>)}
      </div>

      <ol className="recipe-steps">
        {recipe.steps?.map((s, j) => <li key={j}>{s}</li>)}
      </ol>
    </div>
  );
}

export default function RecipesView({ items, aiOk, busy, log, onRun, onGoToSettings, onForget, onClear }) {
  const [meal, setMeal] = useState('any');
  const [request, setRequest] = useState('');

  const urgent = items.filter(i => isUrgent(expiryState(i.expiresOn)));

  // Önskemålet står kvar. Tidigare nollställdes det innan körningen ens hade
  // svarat, så ett misslyckat anrop åt upp texten man just skrivit.
  const run = () => onRun({ meal, request: request.trim() });

  return (
    <>
      <h1>Vad kan jag laga?</h1>
      <p style={{ marginBottom: 'var(--space-5)' }}>
        {urgent.length
          ? `Förslagen utgår från lagret och prioriterar ${urgent.map(i => i.name).slice(0, 3).join(', ')}.`
          : 'Förslagen utgår från vad som finns hemma just nu.'}
      </p>

      {!aiOk && (
        <div className="panel">
          <p style={{ marginBottom: 12 }}>Receptförslag kräver en Anthropic-nyckel.</p>
          <button className="btn-ghost" onClick={onGoToSettings}>Öppna inställningar</button>
        </div>
      )}

      {aiOk && (
        <div className="panel">
          {/* En <label> kan inte namnge en knappgrupp — gruppen får namnet
              i stället, annars är de fyra knapparna namnlösa var för sig. */}
          <label id="meal-label">Måltid</label>
          <div className="segmented on-elevated meal-picker" role="group" aria-labelledby="meal-label">
            {MEALS.map(m => (
              <button key={m.id} className={meal === m.id ? 'active' : ''}
                onClick={() => setMeal(m.id)} aria-pressed={meal === m.id}>
                {m.label}
              </button>
            ))}
          </div>

          <label htmlFor="recipe-wish">Något särskilt?</label>
          <input id="recipe-wish" value={request} maxLength={400}
            placeholder="t.ex. vegetariskt och snabbt"
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && items.length && run()} />

          <button onClick={run} disabled={busy || !items.length}>
            {busy ? <Loader2 size={17} className="spin" /> : <ChefHat size={17} />}
            {busy ? 'Tänker…' : 'Föreslå rätter'}
          </button>

          {/* Att det går att gå härifrån är hela poängen — säg det, annars
              står man kvar och väntar på en snurra. */}
          {busy && <p className="field-hint" style={{ marginBottom: 0 }}>
            Du kan gå till kylskåpet under tiden. Förslagen dyker upp här när de är klara.
          </p>}
        </div>
      )}

      {!items.length && <p style={{ marginTop: 16 }}>Lagret är tomt — skanna in något först.</p>}

      {aiOk && !log.length && !busy && items.length > 0 && (
        <p style={{ marginTop: 'var(--space-5)' }}>Inga förslag än.</p>
      )}

      {log.map(entry => (
        <section key={entry.id} className="log-entry">
          <div className="flex-between log-head">
            {/* "Allt · i dag 19:42" läser illa — utan vald måltid är det bara
                förslag, och då säger rubriken det. */}
            <h3 className="truncate">
              {entry.meal === 'any' ? 'Förslag' : mealLabel(entry.meal)} · {fmtLogTime(entry.at)}
            </h3>
            <button className="btn-icon" onClick={() => onForget(entry.id)}
              aria-label={`Ta bort förslagen från ${fmtLogTime(entry.at)}`}>
              <X size={16} />
            </button>
          </div>
          {entry.request && <p className="log-wish">”{entry.request}”</p>}
          {entry.recipes.map((r, i) => <Recipe key={i} recipe={r} />)}
        </section>
      ))}

      {log.length > 1 && (
        <button className="btn-ghost" style={{ marginTop: 'var(--space-4)' }}
          onClick={() => { if (confirm('Rensa hela receptloggen?')) onClear(); }}>
          Rensa loggen
        </button>
      )}
    </>
  );
}
