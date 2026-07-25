import type { DisplayObject, Surface, TextureContainer } from '@flighthq/sdk';
import {
  addNodeChild,
  createBitmap,
  createCompressedImageResource,
  createDisplayContainer,
  createWgpuCanvasElement,
  createWgpuRenderState,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  registerWgpuCompressedTextureDecoder,
  registerWgpuCompressedTextureUpload,
  registerWgpuDisplayObjectRenderers,
  renderWgpuBackground,
  renderWgpuDisplayObject,
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

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(WIDTH, HEIGHT, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x000000ff });
export const scale = pixelRatio;
export const width = WIDTH;
export const height = HEIGHT;
registerWgpuDisplayObjectRenderers(state);
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

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}

const container: TextureContainer = {
  depth: 1,
  faces: 1,
  format: 'bc1',
  height: TEX,
  layers: 1,
  levels: [{ byteLength: 8, byteOffset: 0, height: TEX, width: TEX }],
  mipLevels: 1,
  supercompression: 'None',
  width: TEX,
};
const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;
const bitmap = createBitmap();
bitmap.data.image = createCompressedImageResource({ container, payload: BC1_BLUE_BLOCK });
bitmap.data.smoothing = false;
bitmap.x = BITMAP_X;
bitmap.y = BITMAP_Y;
bitmap.scaleX = SCALE;
bitmap.scaleY = SCALE;
invalidateNodeLocalTransform(bitmap);
addNodeChild(root, bitmap);
render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const center = at(BITMAP_X + (TEX * SCALE) / 2, BITMAP_Y + (TEX * SCALE) / 2);
  const outside = at(BITMAP_X - 60, BITMAP_Y - 60);
  if (!isBlue(center)) {
    throw new Error(`[compressed-texture] bitmap center not blue, got #${hex(center)}`);
  }
  if (!isBackground(outside)) {
    throw new Error(`[compressed-texture] area outside bitmap not background, got #${hex(outside)}`);
  }
}

function isBlue(rgb: number): boolean {
  return (rgb & 255) > 150 && ((rgb >> 16) & 255) < 90 && ((rgb >> 8) & 255) < 90;
}

function isBackground(rgb: number): boolean {
  return ((rgb >> 16) & 255) < 60 && ((rgb >> 8) & 255) < 60 && (rgb & 255) < 60;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
