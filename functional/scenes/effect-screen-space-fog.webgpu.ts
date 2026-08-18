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
  createScreenSpaceFogEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuScreenSpaceFogEffect,
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
  'An 800×600 field shows four 140×140 rotated squares in a 2×2 arrangement: white at (224,180), ' +
    'yellow at (576,180), cyan at (224,420) and magenta at (576,420), turned by 12, 32, 52 and 72 ' +
    'degrees. A uniform blue-grey haze is blended across both shapes and background, lifting even the ' +
    'extreme corners well above the source near-black R5 G6 B10. Because this scene supplies no depth ' +
    'variation, the haze is flat rather than nearer shapes being clearer or farther shapes being ' +
    'denser. No corner remains near-black and no depth-graded horizon appears.',
);

// Wgpu screenSpaceFog: depth-driven, but no depth buffer is bound here, so this is a color-only
// fallback (flat fog tint) — same intent, no depth gradient.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuScreenSpaceFogEffect(state);

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
    createScreenSpaceFogEffect({ color: 0x9fb4c8ff, near: 0.1, far: 1, density: 0.6 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A normal scene of bright, saturated shapes on a near-black field. screenSpaceFog is depth-driven:
// these tests have no depth buffer, so the recipe is a color-only fallback (a flat fog tint), but the
// scene gives it real content to operate on.

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

// Screen-space fog (color 0x9fb4c8ff, density 0.6) blends a blue-gray fog over the frame. The dark
// background (0x05060aff, luminance ~5) shifts toward the fog color (luminance ~180), raising corner
// pixel luminance above 30. Without the effect, corners stay at ~5 and the check fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(frame, 4, 4);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 30) {
    throw new Error(
      `[effect-screen-space-fog] corner pixel luminance is ${lum.toFixed(1)} (expected > 30) — ` +
        `fog overlay not applied; rgb(${r},${g},${b})`,
    );
  }
}
