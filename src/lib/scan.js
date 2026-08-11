// Streckkodsläsning i webbläsaren.
//
// iOS Safari saknar BarcodeDetector (Chrome/Android har det, WebKit inte), så
// avkodningen sker i WebAssembly via zxing-wasm. Wasm-filen bundlas med appen
// i stället för att hämtas från ett CDN — annars fungerar inte skanningen
// offline, och en installerad hemskärmsapp ska klara ett kylskåp i källaren.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { SCAN_FORMATS } from './scan-formats';
import { t } from './i18n.js';

const SCAN_INTERVAL_MS = 140;   // ~7 försök/sekund räcker gott för en handhållen kamera
const MAX_WIDTH = 720;          // nedskalning: större bild ger inte fler träffar, bara långsammare
const REPEAT_COOLDOWN_MS = 2500; // samma kod om och om igen medan man håller kvar kameran

let modulePromise = null;
export function ensureReader() {
  if (!modulePromise) {
    modulePromise = prepareZXingModule({
      overrides: { locateFile: (file, prefix) => (file.endsWith('.wasm') ? wasmUrl : prefix + file) },
      fireImmediately: true,
    });
  }
  return modulePromise;
}

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('Kameran kräver en säker anslutning (https eller localhost).'));
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', ''); // annars tar iOS över med helskärmsspelaren
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

/*
  Kontinuerlig avkodning ur videoströmmen. Returnerar en stopp-funktion.

  onDetect(barcode) anropas en gång per kod; samma kod ignoreras i ett par
  sekunder efteråt så att man kan hålla kvar kameran utan att lägga in tio
  paket smör. Avkodningen är asynkron — loopen hoppar över en tick hellre än
  att köa upp bildrutor som ändå är inaktuella när de hinner fram.
*/
export function scanLoop(video, onDetect, onError) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let busy = false;
  const lastSeen = new Map();

  const tick = async () => {
    if (stopped || busy) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try {
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const results = await readBarcodes(image, { formats: SCAN_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
      if (stopped) return;
      for (const r of results) {
        const code = r.text?.trim();
        if (!code || !r.isValid) continue;
        const now = Date.now();
        if (now - (lastSeen.get(code) || 0) < REPEAT_COOLDOWN_MS) continue;
        lastSeen.set(code, now);
        onDetect(code, r.format);
      }
    } catch (e) {
      if (!stopped) onError?.(e);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(tick, SCAN_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// Kort vibration vid träff — den enda återkopplingen som fungerar när telefonen
// är riktad ner i en matkasse. Saknas stödet (iOS Safari) händer ingenting.
export const buzz = () => navigator.vibrate?.(40);

// Fotar en bildruta ur strömmen. Används av AI-igenkänningen, som behöver en
// stillbild i stället för en kodavläsning.
export function grabFrame(video, maxWidth = 1024) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
