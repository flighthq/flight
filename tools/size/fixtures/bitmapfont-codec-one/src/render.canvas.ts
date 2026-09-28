// What a build pays when it names the one BMFont front end its content uses.
//
// BMFont writes binary, text and XML all under `.fnt`, so which reader a file needs is knowable only from its
// content. Asking a REGISTRY that question links all four readers, which is what `bitmapfont-codec-all` prices.
// The four front ends are bedrock composable units instead: a caller who knows its asset names the reader and
// pays for that reader.
//
// ★ A BUILD NO LONGER HAS TO CHOOSE BETWEEN THE TWO. `readBitmapFontFormatKind` is separately importable from
// `bitmapFontFormatKind.ts`, so the `.fnt` content analyzer answers "which form is this?" from the bytes and
// emits the one catalog row naming that reader — the generated manifest binds one parser and reaches no
// registry. This row is what proves the cost of that selection did not move.
import { parseBitmapFontXml } from '@flighthq/bitmapfont-formats';

export const font = parseBitmapFontXml('<font><common lineHeight="32" base="26"/><chars/></font>');
