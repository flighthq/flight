// What a build pays for auto-detection across every BMFont encoding — the registry route, named honestly.
//
// Its pair, `bitmapfont-codec-one`, names a single front end. The difference is what the removed `.fnt` analyzer
// was quietly charging every build that used it.
import { applyBitmapFontImportOptions, bitmapFontAllFormats, parseBitmapFont } from '@flighthq/bitmapfont-formats';

applyBitmapFontImportOptions({ formats: bitmapFontAllFormats });

export const font = parseBitmapFont(new Uint8Array([66, 77, 70, 3]));
