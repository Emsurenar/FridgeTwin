import { useMemo } from 'react';
import { railColumns, columnState, tallestColumn, RAIL_PAST, RAIL_FUTURE } from '../lib/rail';

/*
  Kylskåpets framtid som streckkod.

  Appens grundhandling är att läsa en streckkod, och det som står tryckt bredvid
  den på varje förpackning är bäst före-datumet. Här är de två vända ut och in:
  förpackningarnas datum blir kylskåpets egen kod.

  Den ersätter både den gamla statiska rubriken och luckraden — 290 px krom som
  aldrig ändrades blir 76 px som ändras varje dag.
*/
export default function Rail({ items, onPick }) {
  const cols = useMemo(() => railColumns(items), [items]);
  const max = useMemo(() => tallestColumn(cols), [cols]);

  // Ett streck ska synas även när det är ensamt, och den högsta ska inte slå i
  // taket. 22–100 % är intervallet som håller båda sanna.
  const height = (n) => (n ? `${Math.round(22 + (n / max) * 78)}%` : '0%');

  const column = (col, extraClass = '') => {
    const n = col.items.length;
    return (
      <button
        key={col.key}
        type="button"
        className={`rail-col ${extraClass} ${n ? `rail-${columnState(col)}` : 'rail-tom'}`}
        disabled={!n}
        onClick={() => n && onPick(col.items[0])}
        aria-label={etikett(col, n)}
      >
        <span className="rail-bar" style={{ height: height(n) }} />
      </button>
    );
  };

  return (
    <div className="rail">
      <div className="rail-plot">
        <div className="rail-days">
          {cols.days.map(col => column(col))}
        </div>
        {/* Senare och utan datum är egna sorters svar, inte dagar — därför
            avskilda från skalan i stället för hopklumpade i högerkanten.
            "Utan" bär appens accentfärg: det är inte ett tillstånd att oroa sig
            för utan en uppgift att göra något åt. */}
        <div className="rail-aside">
          {column(cols.later, 'rail-col-vid rail-senare')}
          {column(cols.none, 'rail-col-vid rail-utan')}
        </div>
      </div>

      {/* Axeln speglar plottens layout exakt, så etiketterna står under sina
          egna kolumner i stället för att trängas på en rad. */}
      <div className="rail-axis" aria-hidden="true">
        <div className="rail-axis-days">
          <span>passerat</span>
          <span className="rail-now">i dag</span>
          <span>+{RAIL_FUTURE}</span>
        </div>
        <div className="rail-axis-aside">
          <span>sen</span>
          <span>utan</span>
        </div>
      </div>
    </div>
  );
}

function etikett(col, n) {
  const vad = n === 1 ? '1 vara' : `${n} varor`;
  if (col.key === 'none') return n ? `${vad} utan datum` : 'inga varor utan datum';
  if (col.key === 'later') return n ? `${vad} längre fram` : 'inga varor längre fram';
  if (!n) return 'inget den dagen';
  if (col.offset === 0) return `${vad} går ut i dag`;
  if (col.offset === 1) return `${vad} går ut i morgon`;
  if (col.offset < 0) {
    const d = Math.abs(col.offset);
    return col.offset === -RAIL_PAST
      ? `${vad} gick ut för ${d} dagar sedan eller mer`
      : `${vad} gick ut för ${d} ${d === 1 ? 'dag' : 'dagar'} sedan`;
  }
  return `${vad} går ut om ${col.offset} dagar`;
}
