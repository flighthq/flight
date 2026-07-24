import { createBitmapText, getBitmapTextQuadBatches, updateBitmapText } from '@flighthq/bitmaptext';
import {
  createGlyphAtlas,
  createGlyphSourceFromGlyphAtlas,
  createStubGlyphRasterizerBackend,
  createWebGlyphRasterizerBackend,
  getGlyphAtlasSurface,
  setGlyphRasterizerBackend,
} from '@flighthq/glyphatlas';
import type { BitmapText } from '@flighthq/sdk';
import {
  addNodeChild,
  createBitmap,
  createDisplayObject,
  createImageResourceFromSurface,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// This is the runtime counterpart to loading a pre-generated .fnt file: glyphs are rasterized on
// first use, packed into one growing surface, then consumed through the same GlyphSource seam.
// Headless Chromium cannot share document fonts with the OffscreenCanvas rasterizer, so automation
// uses glyphatlas's deterministic non-blank test backend. Interactive browsers render real glyphs.
const captureWindow = window as typeof window & { __flightCapture?: boolean };
setGlyphRasterizerBackend(
  captureWindow.__flightCapture ? createStubGlyphRasterizerBackend() : createWebGlyphRasterizerBackend(),
);
const atlas = createGlyphAtlas({
  fontFamily: 'sans-serif',
  fontSize: 52,
  width: 512,
  height: 256,
  padding: 2,
});
const glyphSource = createGlyphSourceFromGlyphAtlas(atlas);
const bitmapTexts: BitmapText[] = [];

function addText(
  text: string,
  x: number,
  y: number,
  color: number,
  options?: Readonly<{ letterSpacing?: number; lineHeight?: number; wrapWidth?: number }>,
): BitmapText {
  const bitmapText = createBitmapText(glyphSource, {
    color,
    letterSpacing: options?.letterSpacing,
    lineHeight: options?.lineHeight,
    text,
    wrapWidth: options?.wrapWidth,
  });
  bitmapText.x = x;
  bitmapText.y = y;
  invalidateNodeLocalTransform(bitmapText);
  updateBitmapText(bitmapText);
  addNodeChild(root, bitmapText);
  bitmapTexts.push(bitmapText);
  return bitmapText;
}

addText('FLIGHT', 36, 32, 0x00d9ffff, { letterSpacing: 4 });
addText('Runtime Glyph Atlas', 36, 112, 0xffd166ff, { letterSpacing: 1 });
addText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 36, 188, 0xef476fff, { letterSpacing: 2, wrapWidth: 700 });
addText('0123456789  Lazy • Packed • Reused', 36, 318, 0x06d6a0ff, {
  letterSpacing: 1,
  lineHeight: 1.15,
  wrapWidth: 700,
});

// Materialize the completed CPU atlas once so every backend consumes the same uploadable image.
// The atlas remains the source of glyph metrics and regions; only its finalized pixels are adapted.
const atlasImage = createImageResourceFromSurface(getGlyphAtlasSurface(atlas));
for (const bitmapText of bitmapTexts) {
  for (const quadBatch of getBitmapTextQuadBatches(bitmapText)) {
    if (quadBatch.data.atlas !== null) quadBatch.data.atlas.image = atlasImage;
  }
}

// Preview the exact finalized atlas image sampled by every BitmapText quad batch.
const atlasPreview = createBitmap({ data: { image: atlasImage } });
atlasPreview.x = 536;
atlasPreview.y = 438;
atlasPreview.scaleX = 0.42;
atlasPreview.scaleY = 0.42;
invalidateNodeLocalTransform(atlasPreview);
addNodeChild(root, atlasPreview);

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
