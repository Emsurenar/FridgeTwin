import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';

/*
  Bottenarket, med den tangentbordshantering varje ark behöver.

  Tidigare var överlagringens onClick enda vägen ut. Det räcker med mus, men
  inte annars — och sedan besluten flyttade hit från raderna är arket enda
  vägen till "Slängd" och "Slut". En tangentbordsanvändare som öppnade ett kort
  för att titta kunde varken stänga det eller ta sig vidare: sparaknappen är
  inaktiv när inget ändrats, och något stängkryss fanns inte.

  Vad som ingår:
  · role="dialog" + aria-modal, så hjälpmedel vet att resten är utanför
  · Escape stänger
  · fokus flyttas in vid öppning och tillbaka till den knapp man kom ifrån
  · fokus fastnar innanför arket i stället för att vandra ut i listan bakom
  · ett synligt stängkryss, för det ska aldrig krävas ett beslut för att backa
*/
export default function Sheet({ title, onClose, children }) {
  const arkRef = useRef(null);
  const komFran = useRef(null);
  /*
    onClose är en ny pilfunktion vid varje rendering av App, så en effekt med
    [onClose] som beroende kördes om hela tiden — och flyttade då fokus tillbaka
    till arket ur fältet man just skrev i. Refen låter effekten köra en gång.
  */
  const stang = useRef(onClose);
  stang.current = onClose;

  useEffect(() => {
    komFran.current = document.activeElement;
    // Arket självt tar fokus först; har det ett autoFocus-fält vinner det.
    if (!arkRef.current?.contains(document.activeElement)) arkRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        return stang.current();
      }
      if (e.key !== 'Tab') return;

      const fokuserbara = arkRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!fokuserbara?.length) return;
      const forsta = fokuserbara[0];
      const sista = fokuserbara[fokuserbara.length - 1];
      if (e.shiftKey && document.activeElement === forsta) {
        e.preventDefault();
        sista.focus();
      } else if (!e.shiftKey && document.activeElement === sista) {
        e.preventDefault();
        forsta.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Tillbaka dit man kom ifrån — om raden finns kvar. Har varan tagits bort
      // är knappen avmonterad, och då är det rätt att inte tvinga fokus någonstans.
      const t = komFran.current;
      if (t && document.contains(t)) t.focus();
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={arkRef} className="modal-sheet" tabIndex={-1}
        role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}>
        <button className="ark-stang" onClick={onClose} aria-label={t('Stäng')}>
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
