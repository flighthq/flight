import { createWebGlyphRasterizerBackend, enableHostWebImage } from '@flighthq/host-web/contract';
import type { BitmapText } from '@flighthq/sdk';
import {
  addNodeChild,
  createSprite,
  createDisplayObject,
  createImageResourceFromBitmap,
  createTexture,
  explainImageOperation,
  invalidateNodeLocalTransform,
  setNodeColorAdjustmentsTint,
} from '@flighthq/sdk';
import {
  createBitmapText,
  getBitmapTextPages,
  refreshBitmapTextGlyphLayout,
  updateBitmapText,
} from '@flighthq/sdk/text';
import {
  createGlyphAtlas,
  createGlyphSourceFromGlyphAtlas,
  createStubGlyphRasterizerBackend,
  getGlyphAtlasBitmap,
  setGlyphRasterizerBackend,
} from '@flighthq/sdk/text';

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
// MITIGATION, not the fix. The four strings below use ~53 distinct glyphs at 52px, which a 512x256
// atlas can only hold by evicting and repacking — correct, but it makes every frame of this example
// depend on the repack path. Sizing the atlas to hold the whole working set keeps the example about
// what it demonstrates. The correctness fix is the layout-version seam: `refreshBitmapTextGlyphLayout`
// below re-bakes any node a repack moved, and is what an app with a genuinely unbounded glyph set
// relies on.
const atlas = createGlyphAtlas({
  fontFamily: 'sans-serif',
  fontSize: 52,
  width: 1024,
  height: 512,
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
    letterSpacing: options?.letterSpacing,
    lineHeight: options?.lineHeight,
    text,
    wrapWidth: options?.wrapWidth,
  });
  // Tint is the node's generic color adjustment, folded on backends that realize adjustments (gl/wgpu).
  setNodeColorAdjustmentsTint(bitmapText, color);
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

// Each `addText` above laid out against the atlas as it stood at that moment, and every later string
// rasterized more glyphs into it. Had any of those insertions repacked, the earlier nodes' baked
// regions would now cover other glyphs — so re-bake anything the atlas moved before its pixels are
// frozen. This is a no-op when nothing repacked, which is what the sizing above arranges.
for (const bitmapText of bitmapTexts) refreshBitmapTextGlyphLayout(bitmapText);

// Materialize the completed CPU atlas once so every backend consumes the same uploadable image.
// The atlas remains the source of glyph metrics and regions; only its finalized pixels are adapted.
enableHostWebImage();
const atlasImage = createImageResourceFromBitmap(getGlyphAtlasBitmap(atlas));
if (atlasImage === null) {
  const explanation = explainImageOperation('createImageFromBitmap');
  const refusal = document.createElement('p');
  refusal.textContent = `Bitmap atlas materialization unavailable (${explanation.layer}).`;
  document.body.appendChild(refusal);
} else {
  for (const bitmapText of bitmapTexts) {
    for (const page of getBitmapTextPages(bitmapText)) {
      page.atlas.texture = createTexture({ dimension: '2d', source: atlasImage });
    }
  }

  // Preview the exact finalized atlas image sampled by every BitmapText quad batch.
  const atlasPreview = createSprite({
    data: { texture: createTexture({ dimension: '2d', source: atlasImage }) },
  });
  atlasPreview.x = 536;
  atlasPreview.y = 438;
  // Half the previous scale, so the doubled atlas above previews at the same on-screen footprint.
  atlasPreview.scaleX = 0.21;
  atlasPreview.scaleY = 0.21;
  invalidateNodeLocalTransform(atlasPreview);
  addNodeChild(root, atlasPreview);
  enterFrame();
}

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}
