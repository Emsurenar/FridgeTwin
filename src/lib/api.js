// Klientens API-lager. Hushållsnyckeln följer med varje anrop och bor i
// localStorage — det är den som avgör vilket kylskåp man tittar in i.
import { t } from './i18n.js';

const KEY_STORAGE = 'fridge_twin_key';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const newKey = () => 'ft-' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);

/*
  Nyckeln måste finnas även när localStorage kastar — i privat läge, med kvoten
  full, eller när tredjepartslagring är blockerad. Utan fallbacket kraschade
  appen vid start i stället för att köra sessionen ut.
*/
let minnesnyckel = null;

export function getKey() {
  let key;
  try { key = localStorage.getItem(KEY_STORAGE); } catch { key = minnesnyckel; }
  if (!key) {
    key = minnesnyckel || newKey();
    minnesnyckel = key;
    try { localStorage.setItem(KEY_STORAGE, key); } catch { /* sessionen ut */ }
  }
  return key;
}

/*
  Tar emot både en naken nyckel och en hel delningslänk. README säger åt en att
  dela länken, så att klistra in den var det första man försökte — och fick
  "Ogiltig nyckel" tillbaka.
*/
export function setKey(key) {
  const raw = String(key || '').trim();
  const clean = (/[#&]key=([a-zA-Z0-9-]{12,64})/.exec(raw) || [])[1] || raw;
  if (!/^[a-zA-Z0-9-]{12,64}$/.test(clean)) throw new Error(t('Ogiltig nyckel'));
  minnesnyckel = clean;
  try { localStorage.setItem(KEY_STORAGE, clean); } catch { /* sessionen ut */ }
  return clean;
}

export const resetKey = () => {
  minnesnyckel = null;
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* sessionen ut */ }
  return getKey();
};

// En delad länk (#key=…) tas emot en gång och städas bort ur adressfältet, så
// nyckeln inte ligger kvar synlig eller följer med i en bokmärkning.
export function adoptKeyFromUrl() {
  const match = /[#&]key=([a-zA-Z0-9-]{12,64})/.exec(window.location.hash);
  if (!match) return false;
  setKey(match[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

export const shareUrl = () => `${window.location.origin}/#key=${getKey()}`;

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        'X-Fridge-Key': getKey(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(t('Ingen kontakt med servern'), 0);
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 502–504 kommer från en server som startar upp eller ligger nere. Den
    // svarar sällan med JSON, och "Fel 503" säger inget om vad man ska göra.
    const fallback = res.status >= 502 && res.status <= 504
      ? t('Servern svarar inte just nu')
      : t('Fel {n}', { n: res.status });
    // Serverns felsträngar är svenska. t() översätter de kända och släpper
    // igenom resten orörda — bättre svenska än ingenting alls.
    throw new ApiError(json.error ? t(json.error) : fallback, res.status);
  }
  return json;
}

export const getHealth = () => request('/api/health');

export const getInventory = () => request('/api/inventory').then(r => r.items);
export const getHistory = (limit = 100) => request(`/api/history?limit=${limit}`).then(r => r.items);

export const addItem = (payload) => request('/api/inventory', { method: 'POST', body: payload }).then(r => r.item);
export const patchItem = (id, patch) => request(`/api/inventory/${id}`, { method: 'PATCH', body: patch }).then(r => r.item);
export const removeItem = (id, reason = 'consumed') =>
  request(`/api/inventory/${id}?reason=${reason}`, { method: 'DELETE' }).then(r => r.item);
export const restoreItem = (id) => request(`/api/inventory/${id}/restore`, { method: 'POST' }).then(r => r.item);

// Ett steg ner, uträknat på servern. Svarar { item, removed } — removed betyder
// att det var sista exemplaret och att varan nu är markerad som slut.
export const consumeOne = (id) => request(`/api/inventory/${id}/consume`, { method: 'POST' });

// Lägg tillbaka varor servern tappat. Idempotent på id — svarar med hela lagret.
export const syncItems = (items) =>
  request('/api/inventory/sync', { method: 'POST', body: { items } });

// null = okänd streckkod (404), vilket är ett väntat svar och inte ett fel.
export async function lookupProduct(barcode) {
  try {
    return await request(`/api/product/${barcode}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export const searchProducts = (q) =>
  request(`/api/products?q=${encodeURIComponent(q)}`).then(r => r.products);

export const teachProduct = (barcode, fields) =>
  request(`/api/product/${barcode}`, { method: 'PUT', body: fields });
