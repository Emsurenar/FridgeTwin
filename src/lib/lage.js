/*
  Kylskåpets läge, som en mening.

  De flesta appar visar en siffra med en etikett under. Den här skriver ut sitt
  omdöme på svenska, och meningen ändras varje dag: "3 varor har gått ut",
  "Allt håller sig ett tag till". Det är hela hälsokontrollen på en rad, läst
  som en människa hade sagt den — och det är det enda stället i appen där
  texten är stor.

  Ordningen är prioritet, inte antal: har något gått ut spelar det ingen roll
  hur mycket annat som är i sin ordning. Det är den enda mening man behöver.
*/
import { expiryState } from './expiry.js';
import { t } from './i18n.js';

const ental = (n, en, flera) => t(n === 1 ? en : flera);

export function lagesText(items, now = new Date()) {
  if (!items.length) return { text: t('Kylskåpet är tomt.'), ton: 'lugn' };

  let passerat = 0, idag = 0, snart = 0, vecka = 0;
  for (const item of items) {
    switch (expiryState(item.expiresOn, now)) {
      case 'expired': passerat++; break;
      case 'today': idag++; break;
      case 'soon': snart++; break;
      case 'week': vecka++; break;
      default: break;
    }
  }

  if (passerat) {
    return { tal: passerat, text: ental(passerat, 'vara har gått ut.', 'varor har gått ut.'), ton: 'varm' };
  }
  if (idag) {
    return { tal: idag, text: ental(idag, 'vara bör ätas i dag.', 'varor bör ätas i dag.'), ton: 'varm' };
  }
  if (snart) {
    return { tal: snart, text: ental(snart, 'vara går ut inom tre dagar.', 'varor går ut inom tre dagar.'), ton: 'ljum' };
  }
  if (vecka) {
    return { tal: vecka, text: ental(vecka, 'vara går ut den här veckan.', 'varor går ut den här veckan.'), ton: 'lugn' };
  }
  return { text: t('Allt håller sig ett tag till.'), ton: 'lugn' };
}
