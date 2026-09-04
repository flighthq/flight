import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyRectangle, createRectangle, reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry/contract';
import { createNode2D, createNode2DRuntime, getNode2DRuntime } from '@flighthq/scene2d/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type {
  BitmapText,
  BitmapTextAlign,
  BitmapTextData,
  BitmapTextOptions,
  BitmapTextPage,
  BitmapTextRuntime,
  EntityConstruction,
  GlyphSource,
  MethodsOf,
  Node,
  Rectangle,
} from '@flighthq/types/contract';
import { BitmapTextKind } from '@flighthq/types/contract';

// Two floats (x, y) per glyph quad — the vector2 (translation-only) transform stride the BitmapText
// renderer reads. Kept internal so callers never hand-write i*2.
const BITMAP_TEXT_TRANSFORM_STRIDE = 2;

// Writes the laid-out text extent (cached by `updateBitmapText`) into `out`, or a zero rectangle when
// the text has not been laid out yet. Alias-safe: `out` may be the cached rectangle.
export function computeBitmapTextLocalBoundsRectangle(out: Rectangle, source: Readonly<BitmapText>): void {
  const runtime = getNode2DRuntime(source) as BitmapTextRuntime;
  const bounds = runtime.localBoundsRectangle;
  if (bounds === null) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return;
  }
  copyRectangle(out, bounds);
}

// Allocates a BitmapText display node bound to `glyphSource` for both layout AND pixels. The
// `GlyphSource` seam pairs its glyph geometry (rects, advances, kerning, metrics) with the backing atlas
// image(s) those rects sample (`getGlyphAtlasImage(page)`), so no separate image is supplied. The node
// owns one `BitmapTextPage` per glyph-atlas page — a single-page source yields exactly one (page 0),
// created eagerly here — and draws them itself through the registered BitmapText renderer. Call
// `updateBitmapText` to lay out the current `text`, which binds each page's atlas image and grows the set
// for a multi-page source.
export function createBitmapText(glyphSource: GlyphSource | null, options?: Readonly<BitmapTextOptions>): BitmapText {
  const bitmapText = createNode2D(
    BitmapTextKind,
    undefined,
    createBitmapTextData,
    createBitmapTextRuntime,
  ) as BitmapText;
  const data = bitmapText.data;
  data.glyphSource = glyphSource;
  if (options !== undefined) applyBitmapTextOptions(data, options);
  const runtime = getNode2DRuntime(bitmapText) as BitmapTextRuntime;
  runtime.pages.push(createBitmapTextPage());
  return bitmapText;
}

export function createBitmapTextData(data?: Readonly<Partial<BitmapTextData>>): BitmapTextData {
  const out = allocateEntity<BitmapTextData>();
  out.align = data?.align ?? 'left';
  out.glyphSource = data?.glyphSource ?? null;
  out.letterSpacing = data?.letterSpacing ?? 0;
  out.lineHeight = data?.lineHeight ?? 1;
  out.text = data?.text ?? '';
  out.wrapWidth = data?.wrapWidth ?? null;
  return finishEntity(out);
}

export function createBitmapTextRuntime(): BitmapTextRuntime {
  const runtime = createNode2DRuntime(defaultMethods) as BitmapTextRuntime;
  // -1 is below every real version, so a node that has never been laid out reads stale and one
  // `refreshBitmapTextGlyphLayout` brings it up — no separate "was it ever updated" flag.
  runtime.glyphLayoutVersion = -1;
  runtime.localBoundsRectangle = null;
  runtime.pages = [];
  return runtime;
}

// Allocates a fresh Rectangle holding the laid-out text extent. Use
// `computeBitmapTextLocalBoundsRectangle` with an owned `out` in hot paths.
export function getBitmapTextBounds(source: Readonly<BitmapText>): Rectangle {
  const out = createRectangle();
  computeBitmapTextLocalBoundsRectangle(out, source);
  return out;
}

// The glyph-quad pages the node draws — one per glyph-atlas page in page order. A single-page source
// yields exactly one; the array is never empty after construction.
export function getBitmapTextPages(source: Readonly<BitmapText>): readonly BitmapTextPage[] {
  return (getNode2DRuntime(source) as BitmapTextRuntime).pages;
}

// True when the page regions baked by the last `updateBitmapText` no longer describe the glyphs they
// were built for, because the bound glyph source has repacked since. Rects that have gone stale stay
// well-formed — they simply cover other glyphs now — so this version comparison is the only way to
// tell, and it is the check `refreshBitmapTextGlyphLayout` performs. A node that has never been laid
// out reads true; a node with no glyph source, or one bound to a static font, reads false forever.
export function isBitmapTextGlyphLayoutStale(source: Readonly<BitmapText>): boolean {
  const glyphSource = source.data.glyphSource;
  if (glyphSource === null) return false;
  return (getNode2DRuntime(source) as BitmapTextRuntime).glyphLayoutVersion !== glyphSource.getGlyphLayoutVersion();
}

// Grows each page's quad arrays to hold at least `glyphCapacity` glyph quads without reallocating during
// layout. Optional — `updateBitmapText` auto-grows — but avoids incremental reallocation for large
// strings. Reserving every page over-allocates for multi-page text but never under-sizes.
export function reserveBitmapText(target: BitmapText, glyphCapacity: number): void {
  const runtime = getNode2DRuntime(target) as BitmapTextRuntime;
  for (const page of runtime.pages) {
    page.ids = reserveUint16Array(page.ids, glyphCapacity);
    page.transforms = reserveFloat32Array(page.transforms, glyphCapacity * BITMAP_TEXT_TRANSFORM_STRIDE);
  }
}

// The setters below mutate node data only; call `updateBitmapText` afterward to re-lay-out the pages.
export function setBitmapTextAlign(target: BitmapText, align: BitmapTextAlign): void {
  target.data.align = align;
}

export function setBitmapTextGlyphSource(target: BitmapText, glyphSource: GlyphSource | null): void {
  target.data.glyphSource = glyphSource;
}

export function setBitmapTextLetterSpacing(target: BitmapText, letterSpacing: number): void {
  target.data.letterSpacing = letterSpacing;
}

export function setBitmapTextLineHeight(target: BitmapText, lineHeight: number): void {
  target.data.lineHeight = lineHeight;
}

export function setBitmapTextText(target: BitmapText, text: string): void {
  target.data.text = text;
}

export function setBitmapTextWrapWidth(target: BitmapText, wrapWidth: number | null): void {
  target.data.wrapWidth = wrapWidth;
}

function applyBitmapTextOptions(data: BitmapTextData, options: Readonly<BitmapTextOptions>): void {
  if (options.align !== undefined) data.align = options.align;
  if (options.letterSpacing !== undefined) data.letterSpacing = options.letterSpacing;
  if (options.lineHeight !== undefined) data.lineHeight = options.lineHeight;
  if (options.text !== undefined) data.text = options.text;
  if (options.wrapWidth !== undefined) data.wrapWidth = options.wrapWidth;
}

function copyLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const runtime = getNode2DRuntime(source as BitmapText) as BitmapTextRuntime;
  if (runtime.localBoundsRectangle !== null) copyRectangle(out, runtime.localBoundsRectangle);
}

// Allocates an empty page bound to a fresh atlas. Its image and regions are set by `updateBitmapText`.
function createBitmapTextPage(): BitmapTextPage {
  return { atlas: createTextureAtlas(), ids: new Uint16Array(), instanceCount: 0, transforms: new Float32Array() };
}

const defaultMethods: Partial<MethodsOf<BitmapTextRuntime>> = {
  computeLocalBoundsRectangle: copyLocalBoundsRectangle,
};
