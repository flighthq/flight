// compressed-texture — validates that a block-`compressed` Image renders through the real GL
// display draw path. A Bitmap whose image carries ONLY a parsed TextureContainer (no element, no raw
// data) is drawn via scene2d-gl → bindGlImageResourceTexture → uploadGlCompressedTextureContainer.
//
// Real BC1 opaque-blue and BC3 half-alpha-red blocks prove native upload plus the straight-to-premultiplied
// display-shader bridge. The WebGPU twin uses the same blocks and pixel verification.
//
// This is not observable from jsdom: it needs the real GL bind/upload path and rasterization of the
// resulting compressed texture.
import { createCompressedImageResource } from '@flighthq/image';
import type { Bitmap, TextureContainer } from '@flighthq/sdk';
import {
  addNodeChild,
  SpriteKind,
  createSprite,
  createDisplayObject,
  createPixelArtSampler,
  createTexture,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  registerGlCompressedImageTextureResolver,
  registerGlCompressedTextureDecoder,
  registerGlCompressedTextureUpload,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The source texture is 4×4; each source texel becomes a 40×40 output block (nearest sampling) → 160px.
const TEX = 4;
const SCALE = 40;
const BITMAP_X = 320;
const BITMAP_Y = 220;
const ALPHA_BITMAP_X = 100;

// A valid single 4×4 BC1 (DXT1) block that decodes to solid blue. Layout: color0 (RGB565, little-
// endian), color1, then four 2-bit index rows. color0 = pure blue (R=0 G=0 B=31 → 0x001F); color1 =
// color0 and all indices 0, so every texel resolves to color0 — an opaque solid-blue block on native
// hardware. The RGBA decode seam below paints the same blue, so both upload paths agree.
const BC1_BLUE_BLOCK = new Uint8Array([0x1f, 0x00, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BC3_HALF_RED_BLOCK = new Uint8Array([
  0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00,
]);

declareAntialiasingPolicy('aa');

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black
  kinds: [SpriteKind],
  expectedImageDescription:
    'An 800x600 opaque black field with two 160x160 squares sharing the same top edge at y 220 and ' +
    'running down to y 380: one spanning x 100-260 and one spanning x 320-480. The right square is a ' +
    'strong flat blue. The left square is a MUTED, half-strength red — noticeably darker than a full ' +
    'red, because it is drawn at half opacity over the black background, and carrying no blue or green ' +
    'tint. A left square at full-strength red is a failure just as much as a missing one: it would mean ' +
    'the half transparency was ignored. Both squares have hard axis-aligned edges and are one flat tone ' +
    'each — no gradient, no block-shaped patchiness, and no softening at the edges even though each is ' +
    'magnified forty times from a tiny source. Everything outside the two squares is pure black, ' +
    'including the area up and to the left of them near x 260, y 160 — the squares are bounded quads, ' +
    'not a wash across the whole field.',
});

// The compressed upload path is an opt-in seam (so a plain-bitmap GL bundle never carries its
// ~40-format enum table); this scene draws a compressed texture, so it installs the uploader plus an
// RGBA decode fallback that paints the level solid blue (matching the BC1 block's native decode). The
// fallback is used only when the adapter lacks the s3tc extension; both are installed only on the GL state.
if (target.kind === 'webgl') {
  registerGlCompressedImageTextureResolver(target.state);
  registerGlCompressedTextureUpload(target.state);
  registerGlCompressedTextureDecoder(target.state, (_format, w, h) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
    return rgba;
  });
}

const { render, width } = target;

// A single-mip BC1 4×4 container: one 8-byte block (BC1's 4×4 block is 8 bytes).
const container = (format: 'bc1' | 'bc3', byteLength: number): TextureContainer => ({
  format,
  width: TEX,
  height: TEX,
  depth: 1,
  mipLevels: 1,
  layers: 1,
  faces: 1,
  supercompression: 'None',
  levels: [{ byteOffset: 0, byteLength, width: TEX, height: TEX }],
});

const root = createDisplayObject();

const bitmap = createSprite();
bitmap.data.texture = createTexture({
  sampler: createPixelArtSampler(),
  dimension: '2d',
  source: createCompressedImageResource({ container: container('bc1', 8), payload: BC1_BLUE_BLOCK }),
}); // nearest sampling keeps the block a crisp solid quad
bitmap.x = BITMAP_X;
bitmap.y = BITMAP_Y;
bitmap.scaleX = SCALE;
bitmap.scaleY = SCALE;
invalidateNodeLocalTransform(bitmap);
addNodeChild(root, bitmap);

const alphaBitmap = createSprite();
alphaBitmap.data.texture = createTexture({
  sampler: createPixelArtSampler(),
  dimension: '2d',
  source: createCompressedImageResource({
    container: container('bc3', 16),
    payload: BC3_HALF_RED_BLOCK,
  }),
});
alphaBitmap.x = ALPHA_BITMAP_X;
alphaBitmap.y = BITMAP_Y;
alphaBitmap.scaleX = SCALE;
alphaBitmap.scaleY = SCALE;
invalidateNodeLocalTransform(alphaBitmap);
addNodeChild(root, alphaBitmap);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // The bitmap covers a 160×160 blue quad at (BITMAP_X, BITMAP_Y). Sample its center.
  const center = at(BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
  const alphaCenter = at(ALPHA_BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
  if (!isBlue(center)) {
    throw new Error(
      `[compressed-texture] bitmap center not blue — compressed upload did not render — got #${hex(center)}`,
    );
  }

  // Outside the bitmap is background — the compressed texture drew a bounded quad, not a wash.
  const outside = at(BITMAP_X - 60, BITMAP_Y - 60);
  if (!isBackground(outside)) {
    throw new Error(`[compressed-texture] area outside the bitmap not background — got #${hex(outside)}`);
  }
  if (!isHalfRed(alphaCenter)) {
    throw new Error(
      `[compressed-texture] native straight-alpha BC3 did not premultiply before blending — got #${hex(alphaCenter)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 150 && channel(rgb, 16) < 90 && channel(rgb, 8) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function isHalfRed(rgb: number): boolean {
  const red = channel(rgb, 16);
  return red >= 100 && red <= 160 && channel(rgb, 8) < 30 && channel(rgb, 0) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
