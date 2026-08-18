import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createGodRaysEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuGodRaysEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
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
  'A white 80×80 square at upper-center (50%, 40%) surrounded by four colored 100×100 squares (yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0, orange 0xffd45c) arranged radially at 28% of the frame dimensions, all on a near-black background (0x05060a). Radial light streaks emanate outward from the central white core through the dark areas between and beyond the shapes, fading with distance. The HDR pipeline (rgba16f) carries the bright regions into soft volumetric rays.',
);

// Wgpu parity column for god rays. The HDR rgba16f scene target is radially sampled from the light
// center; init is async so createWgpuRenderState is awaited.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuGodRaysEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createGodRaysEffect({
      centerX: 0.5,
      centerY: 0.4,
      density: 0.9,
      decay: 0.95,
      weight: 0.5,
      exposure: 0.4,
      samples: 64,
    }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// God rays radiate from a bright light center. A cluster of bright shapes surrounds the center point
// the effect samples toward, so the HDR pipeline can streak light outward from the occluded core.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Bright core at the light center (centerX 0.5, centerY 0.4 in render.*.ts).
const core = createShape();
appendShapeBeginFill(core, 0xffffffff, 1);
appendShapeRectangle(core, -40, -40, 80, 80);
appendShapeEndFill(core);
core.x = logicalWidth * 0.5;
core.y = logicalHeight * 0.4;
addNodeChild(root, core);

const colors = [0xfff05cff, 0x5cffe0ff, 0xff5ce0ff, 0xffd45cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  const angle = (i / colors.length) * Math.PI * 2;
  shape.x = logicalWidth * 0.5 + Math.cos(angle) * logicalWidth * 0.28;
  shape.y = logicalHeight * 0.4 + Math.sin(angle) * logicalHeight * 0.28;
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);

// God rays stream light outward from the center (0.5, 0.4). The bright core and shapes create
// radial streaks that elevate background luminance along the ray directions. A pixel at the far
// right edge of the frame (on the ray axis) should show luminance > 8 (above pure background ~5).
// Without the effect, this pixel is pure background at ~5 and fails the check.
export function assertRender(frame: Readonly<Bitmap>): void {
  const x = frame.width - 10;
  const y = Math.round(frame.height * 0.4);
  const rgb = getBitmapPixelRgb(frame, x, y);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 8) {
    throw new Error(
      `[effect-god-rays] ray-axis pixel at far edge has luminance ${lum.toFixed(1)} ` +
        `(expected > 8) — god ray streaks not reaching edges; rgb(${r},${g},${b})`,
    );
  }
}
