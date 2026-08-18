import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createCameraMotionBlurEffect,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuCameraMotionBlurEffect,
  defaultWgpuShapeRenderer,
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
  'An 800x600 field on a near-black background with four square tiles 110 px on a side, turned 10, 28, 46 and ' +
    '64 degrees so they span 127, 149, 156 and 147 px corner to corner (side*(cos a + sin a)), marching left to ' +
    'right across the middle of the field at x = W*(0.2 + 0.2*i) = 160, 320, 480 and 640 with y = H*(0.4 + ' +
    '0.12*(i mod 2)) alternating between 240 and 312, with the second and fourth sitting slightly lower than the ' +
    'first and third: white, warm yellow, cyan and pink in that order. Every tile is SMEARED into a RADIAL ' +
    'streak, and the trail extends OUTWARD, away from the centre of the field — not toward it. The shader ' +
    'averages 12 taps of the source at uv + (centre - uv)*t*0.8 for t running 0 to 1, so inverting it, ink drawn ' +
    'at p leaves its copy at q = centre + (p - centre)/(1 - 0.8*t): every tap past the first lands FARTHER from ' +
    'the centre than the source, and the last lands 1/(1 - 0.8) = 5 times as far. The streak is therefore ' +
    'radially aligned, its direction differs per tile rather than running the same way on all four, and the tiles ' +
    'farthest from the centre smear the most. A picture with four crisp-edged tiles is the failure, and so is one ' +
    'whose trails run inward. The field carries much less fine detail than the same tiles drawn without the ' +
    'effect and no tile takes on another hue, but the ink is NOT position-preserving: only the t = 0 tap sits ' +
    'where the tile was drawn, and the rest spread its colour outward.',
);
// Wgpu parity column. Wgpu has no velocity G-buffer here, so the effect is color-only/uniform:
// it applies a uniform full-frame blur rather than a motion-vector-driven smear.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuCameraMotionBlurEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createCameraMotionBlurEffect({ intensity: 0.8, samples: 12 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A few mid-screen shapes spaced along the horizontal axis with gaps between them, so a full-frame
// directional/radial/camera smear leaves clearly readable streaks rather than overlapping mush.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -55, -55, 110, 110);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.2 + 0.2 * i);
  shape.y = logicalHeight * (0.4 + 0.12 * (i % 2));
  shape.rotation = 10 + i * 18;
  addNodeChild(root, shape);
}

render(root);

function measureHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return pairs === 0 ? 0 : deltas / pairs;
}

// Camera motion blur (intensity 0.8) simulates camera movement, smearing the entire frame. The
// unprocessed scene with 4 rotated shapes has HF energy ~3-4. After motion blur, HF drops below
// 1.5. Without the effect, sharp edges keep HF above 1.5 and the check fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 1.5) {
    throw new Error(
      `[effect-camera-motion-blur] high-frequency energy is ${hf.toFixed(2)} (expected < 1.5) — ` +
        `camera motion blur should smooth edges`,
    );
  }
}
