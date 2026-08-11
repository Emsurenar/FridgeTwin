// Foton från telefonens kamera är 3–5 MB. Innan de skickas till Claude skalas
// de ner: en 1024px bred JPEG räcker gott för att läsa ett bäst före-datum
// eller känna igen en gurka, och kostar en bråkdel så många tokens.
import { t } from './i18n.js';

const MAX_WIDTH = 1024;

export function fileToDataUrl(file, maxWidth = MAX_WIDTH) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error(t('Filen är ingen bild')));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t('Kunde inte läsa bilden')));
    };
    img.src = url;
  });
}
