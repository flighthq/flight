import { createRectangle, reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry';
import { invalidateNodeLocalBounds } from '@flighthq/node';
import { getNode2DRuntime } from '@flighthq/scene2d';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import type {
  BitmapText,
  BitmapTextData,
  BitmapTextPage,
  BitmapTextRuntime,
  GlyphEntry,
  GlyphSource,
  Rectangle,
} from '@flighthq/types';

const BITMAP_TEXT_TRANSFORM_STRIDE = 2;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;

// Lays out `bitmapText`'s current string and rewrites its `BitmapTextPage` quads: one quad per visible
// glyph, partitioned by the glyph's atlas page into one page's quads, positioned by the glyph source's
// advances and kerning, broken on explicit newlines and (when `wrapWidth` is set) at word boundaries,
// stacked by the metric line advance, and aligned per line. Each page's atlas image is bound from
// `getGlyphAtlasImage(page)` and its regions rebuilt from that page's encountered glyph rects each call,
// so a dynamic glyph source whose rects shift between layouts stays correct. A single-page source produces
// exactly one page (page 0). A page whose `getGlyphAtlasImage` returns null cannot be sampled, so its
// glyphs are skipped. Missing glyphs (`getGlyphEntry` → null) are omitted entirely — no quad and no
// advance. Bounds span every drawn glyph across all pages. Tint is the node's own color-adjustment stack,
// not touched here.
export function updateBitmapText(bitmapText: BitmapText): void {
  const data = bitmapText.data;
  const runtime = getNode2DRuntime(bitmapText) as BitmapTextRuntime;
  const bounds = ensureBoundsRectangle(runtime);

  // Clear every existing page; pages with glyphs this layout are refilled below, pages that fall silent
  // stay as empty pages drawing nothing.
  for (const page of runtime.pages) {
    page.instanceCount = 0;
    page.atlas.regions.length = 0;
  }

  const glyphSource = data.glyphSource;
  if (glyphSource === null || data.text.length === 0) {
    setEmptyRectangle(bounds);
    invalidateNodeLocalBounds(bitmapText);
    return;
  }

  const metrics = glyphSource.getGlyphMetrics();
  const lineAdvance = (metrics.ascent + metrics.descent + metrics.lineGap) * data.lineHeight;
  const lines = layoutBitmapTextLines(glyphSource, data);
  const refWidth = data.wrapWidth ?? maxLineWidth(lines);
  const pages = new Map<number, BitmapTextPageContext>();
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
        const context = ensureBitmapTextPage(runtime, glyphSource, pages, entry.page);
        if (context === null) continue;
        const quadX = penX + glyph.penWithinWord + entry.bearingX;
        const quadY = baselineY - entry.bearingY;
        let regionId = context.regionByCodepoint.get(glyph.codepoint);
        if (regionId === undefined) {
          addTextureAtlasRegion(context.page.atlas, entry.x, entry.y, entry.width, entry.height);
          regionId = context.page.atlas.regions.length - 1;
          context.regionByCodepoint.set(glyph.codepoint, regionId);
        }
        appendBitmapTextPageQuad(context.page, regionId, quadX, quadY);
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

// Appends one glyph quad (region id + vector2 pen position) to `page`, auto-growing its arrays. The
// page-local twin of `appendQuadBatchInstance`, over plain owned arrays rather than a QuadBatch node.
function appendBitmapTextPageQuad(page: BitmapTextPage, id: number, x: number, y: number): void {
  const index = page.instanceCount;
  const capacity = Math.min(page.ids.length, (page.transforms.length / BITMAP_TEXT_TRANSFORM_STRIDE) | 0);
  if (index >= capacity) {
    const next = Math.max(index + 1, capacity * 2, 8);
    page.ids = reserveUint16Array(page.ids, next);
    page.transforms = reserveFloat32Array(page.transforms, next * BITMAP_TEXT_TRANSFORM_STRIDE);
  }
  page.ids[index] = id;
  const o = index * BITMAP_TEXT_TRANSFORM_STRIDE;
  page.transforms[o] = x;
  page.transforms[o + 1] = y;
  page.instanceCount = index + 1;
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

// Ensures a `BitmapTextPage` exists for glyph-atlas `page` (page-indexed in `runtime.pages`, growing fresh
// pages as needed) and binds it to that page's atlas image, returning the per-layout page context (page +
// region cache). Returns null when the page has no atlas image to sample — its glyphs are then skipped.
function ensureBitmapTextPage(
  runtime: BitmapTextRuntime,
  glyphSource: GlyphSource,
  pages: Map<number, BitmapTextPageContext>,
  page: number,
): BitmapTextPageContext | null {
  const cached = pages.get(page);
  if (cached !== undefined) return cached;

  const image = glyphSource.getGlyphAtlasImage(page);
  if (image === null) return null;

  while (runtime.pages.length <= page) {
    runtime.pages.push({
      atlas: createTextureAtlas(),
      ids: new Uint16Array(),
      instanceCount: 0,
      transforms: new Float32Array(),
    });
  }
  const pageData = runtime.pages[page];
  pageData.atlas.image = image;
  const context: BitmapTextPageContext = { page: pageData, regionByCodepoint: new Map() };
  pages.set(page, context);
  return context;
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

// One page's per-layout emit context: the backing `BitmapTextPage` and the codepoint→region-id cache
// scoped to that page (regions rebuilt this layout).
interface BitmapTextPageContext {
  page: BitmapTextPage;
  regionByCodepoint: Map<number, number>;
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
