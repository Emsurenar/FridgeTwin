// Bara detaljhandelns koder. Färre format ger snabbare avkodning och inga
// slumpvisa träffar på QR-koder som råkar hamna i bild.
//
// Egen fil för att testet ska kunna importera listan utan att dra in scan.js,
// som importerar wasm-filen via Vites ?url-syntax och därför inte går att
// ladda i Node.
export const SCAN_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF'];
