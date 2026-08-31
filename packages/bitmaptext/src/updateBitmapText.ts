import { createRectangle, reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry/contract';
import { invalidateNodeLocalBounds } from '@flighthq/node/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import { createTexture, setTextureSource } from '@flighthq/texture/contract';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas/contract';
import type {
  BitmapText,
  BitmapTextData,
  BitmapTextPage,
  BitmapTextRuntime,
  GlyphEntry,
  GlyphSource,
  Rectangle,
} from '@flighthq/types/contract';

import { isBitmapTextGlyphLayoutStale } from './bitmapText';

// Re-lays-out `bitmapText` when, and only when, its glyph source has repacked since the last layout —
// the pairing that keeps a dynamic atlas correct. Returns whether it re-laid-out, so a caller can count
// churn. Call it once per frame per BitmapText bound to a `@flighthq/glyphatlas` source: a repack
// triggered by ANY consumer of that atlas (another BitmapText adding a glyph, a direct
// `getGlyphAtlasEntry`) relocates this node's glyphs, and its baked page regions then sample whatever
// took their place. The comparison is one number against one number, so the frames where nothing
// repacked cost nothing. A node bound to a static bitmap font never re-lays-out here.
export function refreshBitmapTextGlyphLayout(bitmapText: BitmapText): boolean {
  if (!isBitmapTextGlyphLayoutStale(bitmapText)) return false;
  updateBitmapText(bitmapText);
  return true;
}

/** Installs the bitmap-text guard, or clears it with `null`. The seam keeps the wording and the
 *  `@flighthq/log` dependency in the separately-importable guard module rather than in layout; not
 *  importing that module costs production nothing. Called by `enableBitmapTextGuards`. */
export function setBitmapTextLayoutGuard(guard: ((reason: string, attempts: number) => void) | null): void {
  _layoutGuard = guard;
}

// Lays out `bitmapText`'s current string and rewrites its `BitmapTextPage` quads: one quad per visible
// glyph, partitioned by the glyph's atlas page into one page's quads, positioned by the glyph source's
// advances and kerning, broken on explicit newlines and (when `wrapWidth` is set) at word boundaries,
// stacked by the metric line advance, and aligned per line. Each page's atlas Texture is bound from
// `getGlyphAtlasImage(page)` and its regions rebuilt from that page's encountered glyph rects each call,
// so a dynamic glyph source whose rects shift between layouts stays correct. A single-page source produces
// exactly one page (page 0). A page whose `getGlyphAtlasImage` returns null cannot be sampled, so its
// glyphs are skipped. Missing glyphs (`getGlyphEntry` → null) are omitted entirely — no quad and no
// advance. Bounds span every drawn glyph across all pages. Tint is the node's own color-adjustment stack,
// not touched here.
//
// A dynamic glyph source can repack DURING this call: rasterizing a glyph late in the string may evict
// and relocate one placed early in it. So the layout runs against a placement version and repeats while
// that version moves under it, and the version the winning pass agreed with is what gets stamped for
// `isBitmapTextGlyphLayoutStale`. Passes are bounded — a string whose glyphs cannot all be resident at
// once would otherwise evict each other forever — and the guard layer reports a string that never
// settles.
export function updateBitmapText(bitmapText: BitmapText): void {
  const runtime = getNode2DRuntime(bitmapText) as BitmapTextRuntime;
  const glyphSource = bitmapText.data.glyphSource;
  if (glyphSource === null) {
    layoutBitmapTextPages(bitmapText, runtime);
    runtime.glyphLayoutVersion = -1;
    return;
  }
  for (let attempt = 1; attempt <= BITMAP_TEXT_LAYOUT_ATTEMPTS; attempt++) {
    const version = glyphSource.getGlyphLayoutVersion();
    layoutBitmapTextPages(bitmapText, runtime);
    if (glyphSource.getGlyphLayoutVersion() === version) {
      runtime.glyphLayoutVersion = version;
      return;
    }
  }
  // Out of passes. The last layout is the best available and some of its rects are already wrong; the
  // stamp records what it was built against so the next refresh tries again rather than reading clean.
  runtime.glyphLayoutVersion = glyphSource.getGlyphLayoutVersion();
  _layoutGuard?.('layout-did-not-converge', BITMAP_TEXT_LAYOUT_ATTEMPTS);
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
  if (pageData.atlas.texture === null) {
    pageData.atlas.texture = createTexture({ dimension: '2d', source: image });
  } else {
    setTextureSource(pageData.atlas.texture, image);
  }
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

// One layout pass: the glyph placement itself, with no version bookkeeping. Split out from
// `updateBitmapText` so the retry above re-runs exactly the work a repack invalidated.
function layoutBitmapTextPages(bitmapText: BitmapText, runtime: BitmapTextRuntime): void {
  const data = bitmapText.data;
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

// How many times `updateBitmapText` re-runs a layout that a repack invalidated under it. Two would
// leave no room to distinguish "the first pass warmed the atlas" from "this string cannot settle";
// three is one full pass past a warm atlas, and every pass past that is the same evict-repack cycle.
const BITMAP_TEXT_LAYOUT_ATTEMPTS = 3;

// Two floats (x, y) per glyph quad — the vector2 (translation-only) transform stride the BitmapText
// renderer reads. Kept internal so callers never hand-write i*2.
const BITMAP_TEXT_TRANSFORM_STRIDE = 2;

const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;

let _layoutGuard: ((reason: string, attempts: number) => void) | null = null;
