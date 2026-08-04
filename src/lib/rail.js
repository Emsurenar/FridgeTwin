/*
  Köns indelning.

  Tid är ordningsprincipen, inte plats: det är här den gamla vyns funktionella
  brist dog. Tidigare krävdes tre luckbyten för att se allt som brådskade; nu är
  plats en upplysning på raden i stället för ett läge man växlar mellan.
*/
import { expiryState, isUrgent } from './expiry.js';

export function queueSections(items, now = new Date()) {
  const attGora = [];
  const veckan = [];
  const utanDatum = [];
  const resten = [];

  for (const item of items) {
    const state = expiryState(item.expiresOn, now);
    if (state === 'none') utanDatum.push(item);
    else if (isUrgent(state)) attGora.push(item);
    else if (state === 'week') veckan.push(item);
    else resten.push(item);
  }
  return { attGora, veckan, utanDatum, resten };
}
