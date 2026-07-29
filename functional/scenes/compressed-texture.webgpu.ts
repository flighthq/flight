import { createCompressedImage } from '@flighthq/image';
import type { Node2D, Bitmap, TextureContainer } from '@flighthq/sdk';
import {
  addNodeChild,
  createSprite,
  createDisplayObject,
  createPixelArtSampler,
  createTexture,
  createWgpuCanvasElement,
  createWgpuRenderState,
  getBitmapPixelRgb,
  SpriteKind,
  defaultWgpuScene2DRenderer,
  defaultWgpuSpriteRenderer,
  DisplayObjectKind,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerRenderer,
  registerStandardWgpuMaterial,
  registerWgpuCompressedTextureDecoder,
  registerWgpuCompressedTextureUpload,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const WIDTH = 800;
const HEIGHT = 600;
const TEX = 4;
const SCALE = 40;
const BITMAP_X = 320;
const BITMAP_Y = 220;
const BC1_BLUE_BLOCK = new Uint8Array([0x1f, 0x00, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00]);
const ALPHA_BITMAP_X = 100;
// A valid BC3 block with a constant straight-alpha red texel: alpha endpoints and every alpha
// index select 128/255, while both RGB565 endpoints are solid red and every color index is zero.
const BC3_HALF_RED_BLOCK = new Uint8Array([
  0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00,
]);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(WIDTH, HEIGHT, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x000000ff });
if (!state.device.features.has('texture-compression-bc')) {
  throw new Error('[compressed-texture] native BC support is required for this WebGPU proof');
}
export const scale = pixelRatio;
export const width = WIDTH;
export const height = HEIGHT;
registerStandardWgpuMaterial(state);
registerWgpuImageTextureResolver(state);
registerRenderer(state, DisplayObjectKind, defaultWgpuScene2DRenderer);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
registerWgpuCompressedTextureUpload(state);
registerWgpuCompressedTextureDecoder(state, (_format, w, h) => {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  return rgba;
});
registerWgpuFunctionalTarget(state, scale);

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}

const container = (format: 'bc1' | 'bc3', byteLength: number): TextureContainer => ({
  depth: 1,
  faces: 1,
  format,
  height: TEX,
  layers: 1,
  levels: [{ byteLength, byteOffset: 0, height: TEX, width: TEX }],
  mipLevels: 1,
  supercompression: 'None',
  width: TEX,
});
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;
const bitmap = createSprite();
bitmap.data.texture = createTexture({
  sampler: createPixelArtSampler(),
  storage: {
    dimension: '2d',
    image: createCompressedImage({ container: container('bc1', 8), payload: BC1_BLUE_BLOCK }),
  },
});
bitmap.x = BITMAP_X;
bitmap.y = BITMAP_Y;
bitmap.scaleX = SCALE;
bitmap.scaleY = SCALE;
invalidateNodeLocalTransform(bitmap);
addNodeChild(root, bitmap);

const alphaBitmap = createSprite();
alphaBitmap.data.texture = createTexture({
  sampler: createPixelArtSampler(),
  storage: {
    dimension: '2d',
    image: createCompressedImage({
      container: container('bc3', 16),
      payload: BC3_HALF_RED_BLOCK,
    }),
  },
});
alphaBitmap.x = ALPHA_BITMAP_X;
alphaBitmap.y = BITMAP_Y;
alphaBitmap.scaleX = SCALE;
alphaBitmap.scaleY = SCALE;
invalidateNodeLocalTransform(alphaBitmap);
addNodeChild(root, alphaBitmap);
render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const center = at(BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
  const alphaCenter = at(ALPHA_BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
  const outside = at(BITMAP_X - 60, BITMAP_Y - 60);
  if (!isBlue(center)) {
    throw new Error(`[compressed-texture] bitmap center not blue, got #${hex(center)}`);
  }
  if (!isBackground(outside)) {
    throw new Error(`[compressed-texture] area outside bitmap not background, got #${hex(outside)}`);
  }
  if (!isHalfRed(alphaCenter)) {
    throw new Error(
      `[compressed-texture] native straight-alpha BC3 did not premultiply before blending, got #${hex(alphaCenter)}`,
    );
  }
}

function isBlue(rgb: number): boolean {
  return (rgb & 255) > 150 && ((rgb >> 16) & 255) < 90 && ((rgb >> 8) & 255) < 90;
}

function isBackground(rgb: number): boolean {
  return ((rgb >> 16) & 255) < 60 && ((rgb >> 8) & 255) < 60 && (rgb & 255) < 60;
}

function isHalfRed(rgb: number): boolean {
  const red = (rgb >> 16) & 255;
  return red >= 100 && red <= 160 && ((rgb >> 8) & 255) < 30 && (rgb & 255) < 30;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
