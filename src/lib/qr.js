// QR-kod för att dela hushållsnyckeln — samma bibliotek som skannern, men
// writer-modulen. Laddas lazy: den behövs bara den enda gången någon i
// hushållet ska kopplas in, och wasm-filen ska inte belasta appstarten.
export async function qrSvg(text) {
  const [{ prepareZXingModule, writeBarcode }, { default: wasmUrl }] = await Promise.all([
    import('zxing-wasm/writer'),
    import('zxing-wasm/writer/zxing_writer.wasm?url'),
  ]);
  await prepareZXingModule({
    overrides: { locateFile: (file, prefix) => (file.endsWith('.wasm') ? wasmUrl : prefix + file) },
    fireImmediately: true,
  });
  const result = await writeBarcode(text, { format: 'QRCode', ecLevel: 'M', withQuietZones: true });
  if (result.error) throw new Error(result.error);
  return makeScalable(result.svg);
}

/*
  SVG:n som kommer ut har width/height i moduler (t.ex. 41×41) men ingen
  viewBox. Utan viewBox följer inte innehållet med när CSS sätter en annan
  storlek — koden blir en pytteliten fläck i övre vänstra hörnet av en stor
  ruta. Vi lägger till viewBoxen och låter CSS bestämma storleken.
*/
function makeScalable(svg) {
  if (/viewBox=/i.test(svg)) return svg;
  const m = /<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/i.exec(svg);
  if (!m) return svg;
  return svg.replace('<svg', `<svg viewBox="0 0 ${m[1]} ${m[2]}"`);
}
