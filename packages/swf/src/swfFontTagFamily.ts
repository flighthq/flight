import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { SwfTagFamily, SwfTagParseState, SwfTagReader } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { readSwfFontGlyphOutlineSource } from './swfText';

// Embedded font definitions: the glyph outlines a static text or a field draws through, and the code
// point table that maps a character to one of them. The table arrives in a separate DefineFontInfo tag
// that may precede or follow the outlines, which is why composing the two is a `resolve` step.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_FONT_2 = 48;
const TAG_DEFINE_FONT_3 = 75;
const TAG_DEFINE_FONT_INFO = 13;
const TAG_DEFINE_FONT_INFO_2 = 62;

export const swfFontTagFamily: SwfTagFamily = {
  tags: [TAG_DEFINE_FONT, TAG_DEFINE_FONT_2, TAG_DEFINE_FONT_3, TAG_DEFINE_FONT_INFO, TAG_DEFINE_FONT_INFO_2],
  parse(body, tag, state) {
    if (tag === TAG_DEFINE_FONT_INFO || tag === TAG_DEFINE_FONT_INFO_2) {
      readSwfFontInfo(body, state, tag === TAG_DEFINE_FONT_INFO_2);
      return true;
    }
    readSwfFontDefinition(body, state, tag);
    return true;
  },
  resolve(state) {
    composeSwfFontCodePoints(state);
  },
};

// Font glyphs decode on a reader of their own, so a font this decoder cannot read costs its glyphs and
// nothing else. A font declares no placeable bounds and is never itself placed — it is a table the text
// definitions draw from.
function readSwfFontDefinition(body: SwfTagReader, state: SwfTagParseState, code: number): void {
  const version = code === TAG_DEFINE_FONT ? 1 : code === TAG_DEFINE_FONT_2 ? 2 : 3;
  const reader = new SwfReader(body.source, body.pos, body.end);
  const fontId = reader.source[body.pos] + reader.source[body.pos + 1] * 0x100;
  const source = readSwfFontGlyphOutlineSource(reader, version, state.diagnostics, fontId);
  // A glyph table this decoder cannot read at all costs the WHOLE font, not one glyph, so it is a
  // separate loss from `swf.font-glyph-outline` and must report separately: without this, a font that
  // vanished entirely and a font that imported cleanly both produce no crumb.
  if (source === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.font-glyph-table',
      'readSwfFontDefinition',
      {
        capability: version === 1 ? 'swf.font.define-font' : `swf.font.define-font-${version}`,
        characterId: fontId,
      },
    );
    return;
  }
  if (fontId === 0) return;
  if (state.fontOutlineSources.has(fontId)) {
    // Every other definition kind rejects the document on a repeated character id; fonts do not, so the
    // second table silently replaces the first. The document imports, the font exists, and it is the
    // wrong font — no existence check and no count can see that, which is why it is reported here.
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.font-character-id-reused',
      'readSwfFontDefinition',
      {
        capability: version === 1 ? 'swf.font.define-font' : `swf.font.define-font-${version}`,
        characterId: fontId,
      },
    );
  }
  state.fontOutlineSources.set(fontId, source);
  const fontName = readSwfFontName(body, version);
  if (fontName !== '') state.fontNames.set(fontId, fontName);
}

// DefineFont's original form predates embedded character codes. DefineFontInfo/2 supplies its parallel
// code table in a separate tag, which may appear before or after the font definition. Keep that metadata
// during the tag walk and compose it only once every timeline has been visited.
function readSwfFontInfo(body: SwfTagReader, state: SwfTagParseState, hasLanguage: boolean): void {
  const fontId = body.readUint16();
  const nameLength = body.readUint8();
  for (let index = 0; index < nameLength; index++) body.readUint8();
  const flags = body.readUint8();
  if (hasLanguage) body.readUint8();
  if (!body.valid || fontId === 0) return;

  const codePoints: number[] = [];
  const wideCodes = (flags & FONT_INFO_FLAG_WIDE_CODES) !== 0;
  while (body.pos < body.end && body.valid) codePoints.push(wideCodes ? body.readUint16() : body.readUint8());
  if (body.valid) state.fontCodePoints.set(fontId, codePoints);
}

function composeSwfFontCodePoints(state: SwfTagParseState): void {
  for (const [fontId, codePoints] of state.fontCodePoints) {
    const source = state.fontOutlineSources.get(fontId);
    if (source === undefined) continue;
    const codepointToGlyphIndex = new Map<number, number>();
    for (let glyphIndex = 0; glyphIndex < codePoints.length; glyphIndex++) {
      const codePoint = codePoints[glyphIndex];
      if (!codepointToGlyphIndex.has(codePoint)) codepointToGlyphIndex.set(codePoint, glyphIndex);
    }
    state.fontOutlineSources.set(fontId, {
      getGlyphOutline: (out, glyphIndex) => source.getGlyphOutline(out, glyphIndex),
      getGlyphOutlineAdvance: (glyphIndex) => source.getGlyphOutlineAdvance(glyphIndex),
      getGlyphOutlineIndexForCodePoint: (codePoint) => codepointToGlyphIndex.get(codePoint) ?? -1,
      getGlyphOutlineMetrics: () => source.getGlyphOutlineMetrics(),
    });
  }
}

// A version 2 or 3 font names its family between its flags and its glyph count. A version 1 font carries
// no name of its own; a DefineFontInfo tag supplies one, which this importer does not yet read.
function readSwfFontName(body: SwfTagReader, version: number): string {
  if (version === 1) return '';
  const reader = new SwfReader(body.source, body.pos + 2, body.end);
  reader.readUint8();
  reader.readUint8();
  const length = reader.readUint8();
  if (!reader.valid || length === 0 || reader.pos + length > reader.end) return '';
  return _fontNameDecoder.decode(body.source.subarray(reader.pos, reader.pos + length));
}

const FONT_INFO_FLAG_WIDE_CODES = 0x01;

// DefineFontInfo names a font in the file's own encoding; every real file writes it as Latin-1.
const _fontNameDecoder = new TextDecoder('latin1');
