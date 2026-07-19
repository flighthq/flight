// BACKEND CAVEAT: scoped to WebGL. GPU-native block-compressed texture upload is a GL-only feature
// (render-gl's uploadGlCompressedTextureContainer); Canvas/DOM have no compressed-texture path and
// wgpu's is spec-only. So this is a `.webgl.ts` scene with no Canvas/DOM/Wgpu twin.
//
// compressed-texture — validates that a block-`compressed` ImageResource renders through the real GL
// display draw path. A Bitmap whose image carries ONLY a parsed TextureContainer (no element, no raw
// data) is drawn via displayobject-gl → bindGlImageResourceTexture → uploadGlCompressedTextureContainer.
//
// The payload is a REAL, valid single-block BC1 (DXT1) that decodes to solid blue, so the result is the
// same whether the headless adapter uploads it natively (its WEBGL_compressed_texture_s3tc path) or
// falls back to the registered RGBA decode seam (which paints the same blue). Either way a blue quad
// must appear where the bitmap sits — proving the compressed payload flowed to a real quad on screen.
//
// This is not observable from jsdom: it needs the real GL bind/upload path and rasterization of the
// resulting compressed texture.
import type { Surface, TextureContainer } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createCompressedImageResource,
  createDisplayContainer,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  registerGlCompressedTextureDecoder,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The source texture is 4×4; each source texel becomes a 40×40 output block (nearest sampling) → 160px.
const TEX = 4;
const SCALE = 40;
const BITMAP_X = 320;
const BITMAP_Y = 220;

// A valid single 4×4 BC1 (DXT1) block that decodes to solid blue. Layout: color0 (RGB565, little-
// endian), color1, then four 2-bit index rows. color0 = pure blue (R=0 G=0 B=31 → 0x001F); color1 =
// color0 and all indices 0, so every texel resolves to color0 — an opaque solid-blue block on native
// hardware. The RGBA decode seam below paints the same blue, so both upload paths agree.
const BC1_BLUE_BLOCK = new Uint8Array([0x1f, 0x00, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00]);

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black
  kinds: [BitmapKind],
});

// The RGBA decode fallback: paint the level solid blue (matching the BC1 block's native decode). Used
// only when the adapter lacks the s3tc extension; installed only on the GL state.
if (target.kind === 'webgl') {
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
const container: TextureContainer = {
  format: 'bc1',
  width: TEX,
  height: TEX,
  depth: 1,
  mipLevels: 1,
  layers: 1,
  faces: 1,
  supercompression: 'None',
  levels: [{ byteOffset: 0, byteLength: 8, width: TEX, height: TEX }],
};

const root = createDisplayContainer();

const bitmap = createBitmap();
bitmap.data.image = createCompressedImageResource({ container, payload: BC1_BLUE_BLOCK });
bitmap.data.smoothing = false; // nearest sampling keeps the block a crisp solid quad
bitmap.x = BITMAP_X;
bitmap.y = BITMAP_Y;
bitmap.scaleX = SCALE;
bitmap.scaleY = SCALE;
invalidateNodeLocalTransform(bitmap);
addNodeChild(root, bitmap);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // The bitmap covers a 160×160 blue quad at (BITMAP_X, BITMAP_Y). Sample its center.
  const center = at(BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
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
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
