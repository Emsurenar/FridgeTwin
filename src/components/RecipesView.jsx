import { useState } from 'react';
import { ChefHat, Loader2, X, Package, Star } from 'lucide-react';
import { MEALS, mealLabel } from '../lib/ai';
import { expiryState, isUrgent } from '../lib/expiry';
import { fmtLogTime } from '../lib/fmt';
import { matchUses, matchCount } from '../lib/recipes';
import { getRating } from '../lib/ratings';
import { t } from '../lib/i18n';

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
      <h4 className="ratt-etikett">{t(hemma ? 'Tömmer ur kylskåpet' : 'Använder')}</h4>
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

/*
  Betyget på en lagad rätt. Betygen går in i nästa prompt, så modellen slutar
  föreslå sådant hushållet inte tycker om.

  Samma stjärna igen nollställer. Ett felsatt betyg som inte går att ta tillbaka
  hade styrt förslagen för alltid.
*/
function Betyg({ title, value, onRate }) {
  return (
    <div className="betyg">
      <div className="betyg-stjarnor" role="group" aria-label={t('Betygsätt {title}', { title })}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} className={`stjarna ${n <= value ? 'stjarna-pa' : ''}`}
            aria-label={t('{n} av 5', { n })} aria-pressed={n === value}
            onClick={() => onRate(title, n)}>
            <Star size={19} fill={n <= value ? 'currentColor' : 'none'} strokeWidth={1.8} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Ratt({ recipe, items, betyg, onRate }) {
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
          <h4 className="ratt-etikett ratt-etikett-varm">{t('Behöver köpas')}</h4>
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

      <Betyg title={recipe.title} value={betyg} onRate={onRate} />
    </article>
  );
}

export default function RecipesView({ items, aiOk, busy, log, ratings, onRate, onRun, onGoToSettings, onForget, onClear }) {
  const [meal, setMeal] = useState('any');
  const [request, setRequest] = useState('');

  const urgent = items.filter(i => isUrgent(expiryState(i.expiresOn)));

  // Önskemålet står kvar. Nollställdes det innan körningen svarat åt ett
  // misslyckat anrop upp texten man just skrivit.
  const run = () => onRun({ meal, request: request.trim() });

  return (
    <>
      <header className="sidhuvud">
        <h1>{t('Vad kan jag laga?')}</h1>
        <p>
          {!items.length
            ? t('Lagret är tomt — skanna in något först.')
            : urgent.length
            ? t('Förslagen prioriterar {list}.', { list: urgent.map(i => i.name).slice(0, 3).join(', ') })
            : t('Förslagen utgår från vad som finns hemma just nu.')}
        </p>
      </header>

      {!aiOk && (
        <div className="panel">
          <p style={{ marginBottom: 14 }}>{t('Receptförslag kräver en Anthropic-nyckel.')}</p>
          <button className="btn-ghost" onClick={onGoToSettings}>{t('Öppna inställningar')}</button>
        </div>
      )}

      {/* Kontrollerna i ett vanligt kort. Den mörka instrumentpanelen är borta
          ur hela appen — en svart låda överst i en matapp läste som ett
          utvecklarverktyg. */}
      {aiOk && (
        <div className="panel">
          <label id="meal-label">{t('Måltid')}</label>
          <div className="segmented meal-picker" role="group" aria-labelledby="meal-label">
            {MEALS.map(m => (
              <button key={m.id} className={meal === m.id ? 'active' : ''}
                onClick={() => setMeal(m.id)} aria-pressed={meal === m.id}>
                {t(m.label)}
              </button>
            ))}
          </div>

          <label htmlFor="recipe-wish">{t('Något särskilt?')}</label>
          <input id="recipe-wish" value={request} maxLength={400}
            placeholder={t('Vegetariskt, snabbt, barnvänligt…')}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && items.length && run()} />

          <button style={{ marginTop: 16 }} onClick={run} disabled={busy || !items.length}>
            {busy ? <Loader2 size={17} className="spin" /> : <ChefHat size={17} />}
            {busy ? t('Tänker…') : t('Föreslå rätter')}
          </button>

          {/* Att det går att gå härifrån är hela poängen — säg det, annars står
              man kvar och väntar på en snurra. */}
          {busy && (
            <p style={{ marginTop: 12, fontSize: '0.85rem' }}>
              {t('Du kan gå till kylskåpet under tiden. Förslagen dyker upp här när de är klara.')}
            </p>
          )}
        </div>
      )}

      {aiOk && !log.length && !busy && items.length > 0 && (
        <p className="lugnt">{t('Inga förslag än')}</p>
      )}

      {log.map(entry => (
        <section key={entry.id} className="log-entry">
          <div className="flex-between log-head">
            {/* "Allt · i dag 19:42" läser illa — utan vald måltid är det bara
                förslag, och då säger rubriken det. */}
            <h3 className="truncate">
              {entry.meal === 'any' ? t('Förslag') : t(mealLabel(entry.meal))} · {fmtLogTime(entry.at)}
            </h3>
            <button className="btn-icon" onClick={() => onForget(entry.id)}
              aria-label={t('Ta bort förslagen från {time}', { time: fmtLogTime(entry.at) })}>
              <X size={16} />
            </button>
          </div>
          {entry.request && <p className="log-wish">”{entry.request}”</p>}
          {entry.recipes.map((r, i) => (
            <Ratt key={i} recipe={r} items={items}
              betyg={getRating(ratings, r.title)} onRate={onRate} />
          ))}
        </section>
      ))}

      {log.length > 1 && (
        <button className="btn-ghost" style={{ marginTop: 20 }}
          onClick={() => { if (confirm(t('Rensa hela receptloggen?'))) onClear(); }}>
          {t('Rensa loggen')}
        </button>
      )}
    </>
  );
}
