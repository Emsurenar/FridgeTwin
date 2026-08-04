import { useState } from 'react';
import { ChefHat, Loader2, X, Package } from 'lucide-react';
import { MEALS, mealLabel } from '../lib/ai';
import { expiryState, isUrgent } from '../lib/expiry';
import { fmtLogTime } from '../lib/fmt';
import { matchUses, matchCount } from '../lib/recipes';

/*
  Förslagen hämtas bara när man ber om dem — ett automatiskt anrop vid varje
  sidladdning hade bränt tokens på en fråga användaren inte ställt.

  Körningen och loggen bor i App, inte här. Vyn avmonteras vid varje flikbyte,
  och tog tidigare både pågående anrop och färdiga förslag med sig i fallet.
*/

/*
  Vilka av dina varor rätten tömmer.

  Modellen svarar med ingrediensnamn i fritext; matchningen parar ihop dem med
  lagret så att de som faktiskt står hemma visas med sin egen produktbild.
  Rätten blir därmed en hylla som töms i stället för en lista med ord — och man
  ser direkt om ett förslag rör den mat som brådskar eller bara låter gott.
*/
function Anvander({ uses, items }) {
  const matchade = matchUses(uses, items);
  if (!matchade.length) return null;
  const hemma = matchCount(matchade);

  return (
    <div className="ratt-block">
      <h4 className="ratt-etikett">{hemma ? 'Tömmer ur kylskåpet' : 'Använder'}</h4>
      <div className="ratt-varor">
        {matchade.map(({ label, item }, i) => (
          item ? (
            <span key={i} className="ratt-vara">
              <span className="ratt-bild">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" loading="lazy" />
                  : <Package size={12} strokeWidth={1.6} />}
              </span>
              {item.name}
            </span>
          ) : (
            <span key={i} className="ratt-vara ratt-vara-utan">{label}</span>
          )
        ))}
      </div>
    </div>
  );
}

function Ratt({ recipe, items }) {
  return (
    <article className="ratt">
      <div className="ratt-huvud">
        <h2 className="ratt-titel">{recipe.title}</h2>
        <span className="ratt-tid">{recipe.minutes} min</span>
      </div>
      <p className="ratt-varfor">{recipe.why}</p>

      <Anvander uses={recipe.uses} items={items} />

      {recipe.missing?.length > 0 && (
        <div className="ratt-block">
          <h4 className="ratt-etikett ratt-etikett-varm">Behöver köpas</h4>
          <div className="ratt-varor">
            {recipe.missing.map(m => (
              <span key={m} className="ratt-vara ratt-vara-saknas">{m}</span>
            ))}
          </div>
        </div>
      )}

      <ol className="ratt-steg">
        {recipe.steps?.map((s, j) => <li key={j}>{s}</li>)}
      </ol>
    </article>
  );
}

export default function RecipesView({ items, aiOk, busy, log, onRun, onGoToSettings, onForget, onClear }) {
  const [meal, setMeal] = useState('any');
  const [request, setRequest] = useState('');

  const urgent = items.filter(i => isUrgent(expiryState(i.expiresOn)));

  // Önskemålet står kvar. Nollställdes det innan körningen svarat åt ett
  // misslyckat anrop upp texten man just skrivit.
  const run = () => onRun({ meal, request: request.trim() });

  return (
    <>
      <header className="sidhuvud">
        <h1>Vad kan jag laga?</h1>
        <p>
          {!items.length
            ? 'Lagret är tomt — skanna in något först.'
            : urgent.length
            ? `Förslagen prioriterar ${urgent.map(i => i.name).slice(0, 3).join(', ')}.`
            : 'Förslagen utgår från vad som finns hemma just nu.'}
        </p>
      </header>

      {!aiOk && (
        <div className="panel">
          <p style={{ marginBottom: 14 }}>Receptförslag kräver en Anthropic-nyckel.</p>
          <button className="btn-ghost" onClick={onGoToSettings}>Öppna inställningar</button>
        </div>
      )}

      {/* Kontrollerna i ett vanligt kort. Den mörka instrumentpanelen är borta
          ur hela appen — en svart låda överst i en matapp läste som ett
          utvecklarverktyg. */}
      {aiOk && (
        <div className="panel">
          <label id="meal-label">Måltid</label>
          <div className="segmented meal-picker" role="group" aria-labelledby="meal-label">
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

          <button style={{ marginTop: 16 }} onClick={run} disabled={busy || !items.length}>
            {busy ? <Loader2 size={17} className="spin" /> : <ChefHat size={17} />}
            {busy ? 'Tänker…' : 'Föreslå rätter'}
          </button>

          {/* Att det går att gå härifrån är hela poängen — säg det, annars står
              man kvar och väntar på en snurra. */}
          {busy && (
            <p style={{ marginTop: 12, fontSize: '0.85rem' }}>
              Du kan gå till kylskåpet under tiden. Förslagen dyker upp här när de är klara.
            </p>
          )}
        </div>
      )}

      {aiOk && !log.length && !busy && items.length > 0 && (
        <p className="lugnt">Inga förslag än</p>
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
          {entry.recipes.map((r, i) => <Ratt key={i} recipe={r} items={items} />)}
        </section>
      ))}

      {log.length > 1 && (
        <button className="btn-ghost" style={{ marginTop: 20 }}
          onClick={() => { if (confirm('Rensa hela receptloggen?')) onClear(); }}>
          Rensa loggen
        </button>
      )}
    </>
  );
}
