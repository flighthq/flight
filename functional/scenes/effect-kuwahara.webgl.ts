import {
  webHostGl,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Bitmap, Node2D, GlEffectState } from '@flighthq/sdk';
import {
  createGlSurface,
  defaultScene3DGlRenderRegistry,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlEffectState,
  createDisplayObject,
  createGlEffectState,
  createGlRenderState,
  createKuwaharaEffect,
  createShape,
  registerGlKuwaharaEffect,
  defaultGlShapeRenderer,
  endGlEffectState,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  '18 rotated colored rectangles (pink, green, blue, gold, purple, cyan) on dark background ' +
    '(0x101014), smoothed by Kuwahara radius-4 edge-preserving filter. Broad color regions are ' +
    'flattened with an oil-painting appearance while edges between shapes remain sharp.',
);

// kuwahara: a full-frame stylization pass applied to the whole scene through a default rgba8 pipeline.
const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, 800, 600);
appendWebSurface(glSurface, document.body);

export const state = createGlRenderState(glSurface.context, defaultScene3DGlRenderRegistry, {
  pixelRatio,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlKuwaharaEffect(state);

const pipeline: GlEffectState = createGlEffectState(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const screenClear = { color: [0x10 / 0xff, 0x10 / 0xff, 0x14 / 0xff, 1], depth: 1.0 } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlEffectState(state, pipeline, 'srgb', screenClear);
  renderGlScene2D(pass, root);
  endGlEffectState(pass, pipeline, [createKuwaharaEffect({ radius: 4 })]);
}

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the kuwahara effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
// to act on.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xd25cffff, 0x5cf0ffff];
for (let i = 0; i < 18; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i % colors.length], 1);
  appendShapeRectangle(shape, -28, -10, 56, 20);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.12 + 0.18 * (i % 5));
  shape.y = logicalHeight * (0.18 + 0.2 * Math.floor(i / 5));
  shape.rotation = i * 22;
  addNodeChild(root, shape);
}

render(root);

// Kuwahara (radius 4) is an edge-preserving smoothing filter (oil-painting effect). It reduces
// fine detail at shape edges and within textured regions while keeping broad color boundaries.
// The unprocessed scene with 18 rotated shapes has horizontal HF energy around 2-4 from the many
// small edge transitions. After Kuwahara smoothing, HF drops below 2 as edges soften. Without the
// effect, the sharp edges keep HF above 2 and the assertion fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 2) {
    throw new Error(
      `[effect-kuwahara] high-frequency energy is ${hf.toFixed(2)} (expected < 2) — ` +
        `Kuwahara smoothing not applied`,
    );
  }
}

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
