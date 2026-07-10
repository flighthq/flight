import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { copyRectangle, createRectangle } from '@flighthq/geometry';
import { addNodeChild } from '@flighthq/node';
import { createQuadBatch, reserveQuadBatch } from '@flighthq/sprite';
import { createTextureAtlas } from '@flighthq/textureatlas';
import type {
  BitmapText,
  BitmapTextAlign,
  BitmapTextData,
  BitmapTextOptions,
  BitmapTextRuntime,
  GlyphSource,
  ImageResource,
  MethodsOf,
  Node,
  QuadBatch,
  Rectangle,
} from '@flighthq/types';
import { BitmapTextKind } from '@flighthq/types';

// White (`0xRRGGBBAA` all-ones) — the untinted default; the backing batch stays material-free at this value.
const BITMAP_TEXT_DEFAULT_COLOR = 0xffffffff;

// Writes the laid-out text extent (cached by `updateBitmapText`) into `out`, or a zero rectangle when
// the text has not been laid out yet. Alias-safe: `out` may be the cached rectangle.
export function computeBitmapTextLocalBoundsRectangle(out: Rectangle, source: Readonly<BitmapText>): void {
  const runtime = getDisplayObjectRuntime(source) as BitmapTextRuntime;
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

// Allocates a BitmapText display node bound to `glyphSource` for layout and `image` for the glyph
// pixels. The node owns a backing QuadBatch child whose `TextureAtlas` samples `image`; a
// separately-supplied `image` is required because the `GlyphSource` seam exposes glyph geometry
// (rects, advances, kerning, metrics) but not the atlas texture those rects index into. Call
// `updateBitmapText` to lay out the current `text` into the batch.
export function createBitmapText(
  glyphSource: GlyphSource | null,
  image: ImageResource | null,
  options?: Readonly<BitmapTextOptions>,
): BitmapText {
  const bitmapText = createDisplayObjectGeneric(
    BitmapTextKind,
    undefined,
    createBitmapTextData,
    createBitmapTextRuntime,
  ) as BitmapText;
  const data = bitmapText.data;
  data.glyphSource = glyphSource;
  if (options !== undefined) applyBitmapTextOptions(data, options);
  const quadBatch = createQuadBatch({ data: { atlas: createTextureAtlas({ image }) } });
  const runtime = getDisplayObjectRuntime(bitmapText) as BitmapTextRuntime;
  runtime.quadBatch = quadBatch;
  addNodeChild(bitmapText, quadBatch);
  return bitmapText;
}

export function createBitmapTextData(data?: Readonly<Partial<BitmapTextData>>): BitmapTextData {
  return {
    align: data?.align ?? 'left',
    color: data?.color ?? BITMAP_TEXT_DEFAULT_COLOR,
    glyphSource: data?.glyphSource ?? null,
    letterSpacing: data?.letterSpacing ?? 0,
    lineHeight: data?.lineHeight ?? 1,
    text: data?.text ?? '',
    wrapWidth: data?.wrapWidth ?? null,
  };
}

export function createBitmapTextRuntime(): BitmapTextRuntime {
  const runtime = createDisplayObjectRuntime(defaultMethods) as BitmapTextRuntime;
  runtime.localBoundsRectangle = null;
  runtime.quadBatch = null;
  return runtime;
}

// Allocates a fresh Rectangle holding the laid-out text extent. Use
// `computeBitmapTextLocalBoundsRectangle` with an owned `out` in hot paths.
export function getBitmapTextBounds(source: Readonly<BitmapText>): Rectangle {
  const out = createRectangle();
  computeBitmapTextLocalBoundsRectangle(out, source);
  return out;
}

// The backing QuadBatch the node lays glyph quads into — the renderable child. Null before construction.
export function getBitmapTextQuadBatch(source: Readonly<BitmapText>): QuadBatch | null {
  return (getDisplayObjectRuntime(source) as BitmapTextRuntime).quadBatch;
}

// Grows the backing QuadBatch to hold at least `glyphCapacity` glyph quads without reallocating during
// layout. Optional — `updateBitmapText` auto-grows — but avoids incremental reallocation for large strings.
export function reserveBitmapText(target: BitmapText, glyphCapacity: number): void {
  const runtime = getDisplayObjectRuntime(target) as BitmapTextRuntime;
  if (runtime.quadBatch !== null) reserveQuadBatch(runtime.quadBatch, glyphCapacity);
}

// The setters below mutate node data only; call `updateBitmapText` afterward to re-lay-out the batch.
export function setBitmapTextAlign(target: BitmapText, align: BitmapTextAlign): void {
  target.data.align = align;
}

export function setBitmapTextColor(target: BitmapText, color: number): void {
  target.data.color = color;
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
  if (options.color !== undefined) data.color = options.color;
  if (options.letterSpacing !== undefined) data.letterSpacing = options.letterSpacing;
  if (options.lineHeight !== undefined) data.lineHeight = options.lineHeight;
  if (options.text !== undefined) data.text = options.text;
  if (options.wrapWidth !== undefined) data.wrapWidth = options.wrapWidth;
}

function copyLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const runtime = getDisplayObjectRuntime(source as BitmapText) as BitmapTextRuntime;
  if (runtime.localBoundsRectangle !== null) copyRectangle(out, runtime.localBoundsRectangle);
}

const defaultMethods: Partial<MethodsOf<BitmapTextRuntime>> = {
  computeLocalBoundsRectangle: copyLocalBoundsRectangle,
};
