import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';
import { createColorTransform, createUniformColorTransformMaterial } from '@flighthq/materials';
import { invalidateNodeLocalBounds } from '@flighthq/node';
import { appendQuadBatchInstance, clearQuadBatch } from '@flighthq/sprite';
import { addTextureAtlasRegion } from '@flighthq/textureatlas';
import type {
  BitmapText,
  BitmapTextData,
  BitmapTextRuntime,
  GlyphEntry,
  GlyphSource,
  QuadBatch,
  Rectangle,
} from '@flighthq/types';

// White (`0xRRGGBBAA` all-ones) leaves the backing batch material-free — the untinted path.
const BITMAP_TEXT_DEFAULT_COLOR = 0xffffffff;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;

// Lays out `bitmapText`'s current string and rewrites its backing QuadBatch: one quad per visible
// glyph, positioned by the glyph source's advances and kerning, broken on explicit newlines and (when
// `wrapWidth` is set) at word boundaries, stacked by the metric line advance, and aligned per line.
// The batch's atlas regions are rebuilt from the encountered glyph rects each call, so a dynamic glyph
// source whose rects shift between layouts stays correct. Missing glyphs (`getGlyphEntry` → null) are
// omitted entirely — no quad and no advance — since a null entry carries no advance to honor.
export function updateBitmapText(bitmapText: BitmapText): void {
  const data = bitmapText.data;
  const runtime = getDisplayObjectRuntime(bitmapText) as BitmapTextRuntime;
  const quadBatch = runtime.quadBatch;
  if (quadBatch === null) return;
  const atlas = quadBatch.data.atlas;
  clearQuadBatch(quadBatch);
  if (atlas !== null) atlas.regions.length = 0;
  applyBitmapTextColor(quadBatch, data.color);
  const bounds = ensureBoundsRectangle(runtime);
  const glyphSource = data.glyphSource;
  if (glyphSource === null || atlas === null || data.text.length === 0) {
    setEmptyRectangle(bounds);
    invalidateNodeLocalBounds(bitmapText);
    return;
  }

  const metrics = glyphSource.getGlyphMetrics();
  const lineAdvance = (metrics.ascent + metrics.descent + metrics.lineGap) * data.lineHeight;
  const lines = layoutBitmapTextLines(glyphSource, data);
  const refWidth = data.wrapWidth ?? maxLineWidth(lines);
  const regionByCodepoint = new Map<number, number>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const baselineY = metrics.ascent + li * lineAdvance;
    let startX = 0;
    let gapExtra = 0;
    if (data.align === 'center') startX = (refWidth - line.width) / 2;
    else if (data.align === 'right') startX = refWidth - line.width;
    else if (data.align === 'justify' && data.wrapWidth !== null && !line.paragraphEnd && line.gaps.length > 0) {
      gapExtra = (data.wrapWidth - line.width) / line.gaps.length;
    }

    let penX = startX;
    for (let wi = 0; wi < line.words.length; wi++) {
      if (wi > 0) penX += line.gaps[wi - 1] + gapExtra;
      const word = line.words[wi];
      for (const glyph of word.glyphs) {
        const entry = glyph.entry;
        const quadX = penX + glyph.penWithinWord + entry.bearingX;
        const quadY = baselineY - entry.bearingY;
        let regionId = regionByCodepoint.get(glyph.codepoint);
        if (regionId === undefined) {
          addTextureAtlasRegion(atlas, entry.x, entry.y, entry.width, entry.height);
          regionId = atlas.regions.length - 1;
          regionByCodepoint.set(glyph.codepoint, regionId);
        }
        appendQuadBatchInstance(quadBatch, regionId, quadX, quadY);
        if (quadX < minX) minX = quadX;
        if (quadY < minY) minY = quadY;
        if (quadX + entry.width > maxX) maxX = quadX + entry.width;
        if (quadY + entry.height > maxY) maxY = quadY + entry.height;
      }
      penX += word.width;
    }
  }

  if (minX === Infinity) {
    setEmptyRectangle(bounds);
  } else {
    bounds.x = minX;
    bounds.y = minY;
    bounds.width = maxX - minX;
    bounds.height = maxY - minY;
  }
  invalidateNodeLocalBounds(bitmapText);
}

// Sets (or clears) the backing batch's tint material from a packed-RGBA color. White clears it.
function applyBitmapTextColor(quadBatch: QuadBatch, color: number): void {
  if (color === BITMAP_TEXT_DEFAULT_COLOR) {
    quadBatch.material = null;
    return;
  }
  const colorTransform = createColorTransform({
    redMultiplier: ((color >>> 24) & 0xff) / 255,
    greenMultiplier: ((color >>> 16) & 0xff) / 255,
    blueMultiplier: ((color >>> 8) & 0xff) / 255,
    alphaMultiplier: (color & 0xff) / 255,
  });
  quadBatch.material = createUniformColorTransformMaterial(colorTransform);
}

// Measures one paragraph (a newline-free run) into words separated by whitespace gaps. Intra-word
// kerning and letter spacing are baked into each glyph's `penWithinWord` and the word width; kerning
// does not cross a space. Zero-size glyphs advance the pen but produce no quad; missing glyphs are skipped.
function buildBitmapTextWords(glyphSource: GlyphSource, paragraph: string, letterSpacing: number): BitmapTextToken[] {
  const tokens: BitmapTextToken[] = [];
  let pendingGap = 0;
  let glyphs: BitmapTextGlyph[] = [];
  let pen = 0;
  let previousCodepoint = -1;
  let inWord = false;

  const flush = (): void => {
    if (!inWord) return;
    tokens.push({ gap: pendingGap, word: { glyphs, width: pen } });
    pendingGap = 0;
    glyphs = [];
    pen = 0;
    previousCodepoint = -1;
    inWord = false;
  };

  for (const character of paragraph) {
    const codepoint = character.codePointAt(0);
    if (codepoint === undefined || codepoint === CARRIAGE_RETURN) continue;
    if (codepoint === SPACE) {
      flush();
      const spaceEntry = glyphSource.getGlyphEntry(SPACE);
      pendingGap += (spaceEntry !== null ? spaceEntry.advance : 0) + letterSpacing;
      continue;
    }
    const entry = glyphSource.getGlyphEntry(codepoint);
    if (entry === null) continue;
    if (previousCodepoint >= 0) pen += glyphSource.getGlyphKerning(previousCodepoint, codepoint);
    if (entry.width > 0 && entry.height > 0) glyphs.push({ codepoint, entry, penWithinWord: pen });
    pen += entry.advance + letterSpacing;
    previousCodepoint = codepoint;
    inWord = true;
  }
  flush();
  return tokens;
}

function ensureBoundsRectangle(runtime: BitmapTextRuntime): Rectangle {
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  return runtime.localBoundsRectangle;
}

// Greedy line fill: split the text on explicit newlines into paragraphs, then within each paragraph
// pack words onto lines, breaking before a word when `wrapWidth` is set and it would overflow. A word
// wider than `wrapWidth` occupies its own overflowing line (no mid-word breaking).
function layoutBitmapTextLines(glyphSource: GlyphSource, data: Readonly<BitmapTextData>): BitmapTextLine[] {
  const lines: BitmapTextLine[] = [];
  const paragraphs = data.text.split('\n');
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const tokens = buildBitmapTextWords(glyphSource, paragraphs[pi], data.letterSpacing);
    let current: BitmapTextLine = { words: [], gaps: [], width: 0, paragraphEnd: false };
    for (const token of tokens) {
      const wraps =
        data.wrapWidth !== null &&
        current.words.length > 0 &&
        current.width + token.gap + token.word.width > data.wrapWidth;
      if (wraps) {
        lines.push(current);
        current = { words: [token.word], gaps: [], width: token.word.width, paragraphEnd: false };
      } else {
        if (current.words.length > 0) {
          current.gaps.push(token.gap);
          current.width += token.gap;
        }
        current.words.push(token.word);
        current.width += token.word.width;
      }
    }
    current.paragraphEnd = true;
    lines.push(current);
  }
  return lines;
}

function maxLineWidth(lines: readonly BitmapTextLine[]): number {
  let max = 0;
  for (const line of lines) if (line.width > max) max = line.width;
  return max;
}

function setEmptyRectangle(out: Rectangle): void {
  out.x = 0;
  out.y = 0;
  out.width = 0;
  out.height = 0;
}

// One placed glyph within a word: its codepoint, the source entry (atlas rect + bearing + advance),
// and the pen x within the word before the glyph's bearing is applied.
interface BitmapTextGlyph {
  codepoint: number;
  entry: GlyphEntry;
  penWithinWord: number;
}

// One laid-out line: its words, the inter-word gap widths (`gaps[i]` sits between word i and i+1), the
// total advance width, and whether it is the final line of its paragraph (which stays unjustified).
interface BitmapTextLine {
  gaps: number[];
  paragraphEnd: boolean;
  width: number;
  words: BitmapTextWord[];
}

// A word plus the whitespace gap preceding it, produced while measuring a paragraph.
interface BitmapTextToken {
  gap: number;
  word: BitmapTextWord;
}

// A maximal non-space glyph run and its total advance width.
interface BitmapTextWord {
  glyphs: BitmapTextGlyph[];
  width: number;
}
