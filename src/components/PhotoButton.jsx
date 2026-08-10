import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { fileToDataUrl } from '../lib/image';

/*
  Kameraknapp byggd på <input capture="environment"> i stället för en egen
  videoström: på iOS öppnar det systemets kamera med skärpa, blixt och
  bildstabilisering — allt sådant en getUserMedia-ström inte får gratis. För en
  stillbild som ska tolkas av en modell är det klart bättre. Skannern behöver
  däremot strömmen, eftersom den avkodar många bildrutor i sekunden.
*/
export default function PhotoButton({ label, busyLabel = 'Läser…', onPhoto, onError, className = '', disabled, ...rest }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // så att samma bild kan väljas igen
    if (!file) return;
    setBusy(true);
    try {
      // await band tidigare bara fileToDataUrl, så knappen släpptes fri redan
      // efter bildkonverteringen medan AI-anropet fortfarande pågick.
      await onPhoto(await fileToDataUrl(file));
    } catch (err) {
      /*
        Utan den här fångsten föll ett fel från bildkonverteringen ut som ett
        ohanterat promise: snurran slutade snurra och sedan hände ingenting alls.
        Det inträffar på riktigt — en HEIC-fil vald ur biblioteket på datorn går
        inte att avkoda — och tystnad är det sämsta svaret, för användaren
        trycker bara igen och får samma tystnad.
      */
      onError?.(err?.message || 'Kunde inte läsa bilden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        onChange={handle} style={{ display: 'none' }} />
      <button className={className} disabled={disabled || busy}
        onClick={() => inputRef.current?.click()} {...rest}>
        {busy ? <Loader2 size={17} className="spin" /> : <Camera size={17} />}
        {/* Tom label = ren ikonknapp */}
        {busy ? busyLabel : label}
      </button>
    </>
  );
}
