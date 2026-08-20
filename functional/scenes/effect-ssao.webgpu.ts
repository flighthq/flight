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
  createSsaoEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  registerWgpuSsaoEffect,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 140×140 rotated squares form a 2×2 ' +
    'arrangement: white at (224,180), yellow at (576,180), cyan at (224,420) and magenta at ' +
    '(576,420), turned by 12, 32, 52 and 72 degrees. Their centres remain bright and their flat ' +
    'colours remain distinct. With no depth information in this scene, no ambient-occlusion crease, ' +
    'contact shadow or dark depth halo appears; the result is the unoccluded four-shape picture, not ' +
    'a blank field and not four blackened centres.',
);

// Wgpu ssao: depth-driven, but no depth buffer is bound here, so this is a color-only fallback —
// no ambient-occlusion darkening is computed.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuSsaoEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba8' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createSsaoEffect({ radius: 0.5, intensity: 1, bias: 0.025, samples: 16 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A normal scene of bright, saturated shapes on a near-black field. ssao is depth-driven: these tests
// have no depth buffer, so the recipe is a color-only fallback (the scene passes through unoccluded),
// but the scene gives it real content to operate on.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);

// SSAO (intensity 1, 16 samples) applies screen-space ambient occlusion, which may darken areas
// near depth edges. Shape 0 (white, 0xffffffff) at its center should retain high luminance (> 150)
// — SSAO darkens edges, not centers. This verifies the SSAO pipeline produces valid output.
// Without the pipeline, the frame is blank.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.28);
  const cy = Math.round(frame.height * 0.3);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 150) {
    throw new Error(
      `[effect-ssao] white shape center has luminance ${lum.toFixed(1)} (expected > 150) — ` +
        `SSAO pipeline should preserve content at shape centers; rgb(${r},${g},${b})`,
    );
  }
}
