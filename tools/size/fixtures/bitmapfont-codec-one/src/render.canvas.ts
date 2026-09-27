// What a build pays when it names the one BMFont front end its content uses.
//
// BMFont writes binary, text and XML all under `.fnt`, so a build-time analyzer had to ask a registry which one a
// file is — and that question links all four readers. The four front ends are bedrock composable units instead:
// a caller who knows its asset names the reader, and pays for that reader.
import { parseBitmapFontXml } from '@flighthq/bitmapfont-formats';

export const font = parseBitmapFontXml('<font><common lineHeight="32" base="26"/><chars/></font>');
