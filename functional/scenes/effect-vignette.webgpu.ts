import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createShape,
  createVignetteEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  registerWgpuVignetteEffect,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'The entire 800×600 field is one pale blue-white fill (authored R232 G236 B244) with a smooth ' +
    'radial darkening toward every edge and corner. The centre remains close to the authored bright ' +
    'colour while the corner luminance is more than 20 levels darker. There are no objects, borders, ' +
    'bands or abrupt steps: only the continuous centre-to-edge falloff. The corners are not the same ' +
    'brightness as the centre, and no background shows through.',
);

// Wgpu parity column for the same vignette intent as render.webgl.ts. Wgpu render-state init is
// async; the effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuVignetteEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createVignetteEffect({ intensity: 1, radius: 0.7, softness: 0.5 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A single full-bleed bright fill covering the whole frame. With a flat, even color the vignette's
// corner darkening is the only variation in the image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const fill = createShape();
appendShapeBeginFill(fill, 0xe8ecf4ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);

// Vignette darkens edges while preserving the center. The uniform fill (0xe8ecf4ff, luminance ~234)
// fills the entire frame. The center pixel should remain bright while corner pixels should be
// darkened by the vignette. Without the effect, center and corner luminances are equal, so the
// gap is 0 and fails the > 20 check.
export function assertRender(frame: Readonly<Bitmap>): void {
  function luminanceAt(x: number, y: number): number {
    const rgb = getBitmapPixelRgb(frame, x, y);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const centerLum = luminanceAt(Math.round(frame.width / 2), Math.round(frame.height / 2));
  const cornerLum = luminanceAt(4, 4);

  if (centerLum <= cornerLum + 20) {
    throw new Error(
      `[effect-vignette] center luminance ${centerLum.toFixed(1)} is not > corner luminance ` +
        `${cornerLum.toFixed(1)} + 20 — vignette not applied`,
    );
  }
}
