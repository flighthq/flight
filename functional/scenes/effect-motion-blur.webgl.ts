import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, GlRenderEffectPipeline, GlRenderTarget, Node2D } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  beginVelocityFrame,
  contributeVelocity,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlVelocityTarget,
  createMotionBlurEffect,
  createShape,
  createVelocityField,
  defaultGlNode2DVelocityWriter,
  registerDefaultShapeBoundsCommands,
  registerGlMotionBlurEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  getNodeChildAt,
  getNodeChildCount,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerGlVelocityWriter,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  renderGlVelocity,
  setGlRenderEffectVelocityTexture,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Four colored squares (pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c) of 100×100 in a 2×2 arrangement centered at (200,180)/(600,180)/(200,420)/(600,420) on dark 800×600 background (0x101014), not rotated. Each shape is smeared symmetrically along the horizontal axis by a 40-pixel screen-space velocity (16 taps spanning t=[-0.5, 0.5], so ~20 px each side). Sharp vertical edges become soft horizontal gradients on both sides. Four clean-edged squares with no horizontal smear is a failure.',
);

// Per-object motion blur driven by the scene velocity G-buffer. Normally the velocity comes from
// per-frame transform deltas, but a static screenshot has only one frame — so here we *explicitly*
// contribute a screen-space velocity to each shape before rendering the velocity pass. That makes the
// blur visible in a single deterministic capture instead of requiring real motion across frames.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x101014ff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlMotionBlurEffect(state);
registerDefaultShapeBoundsCommands();
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerGlVelocityWriter(state, ShapeKind, defaultGlNode2DVelocityWriter);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget: GlRenderTarget = createGlVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;

  // One frame of contributions: give every top-level child a fixed horizontal screen-space velocity so
  // the motion-blur pass has direction/length to smear, even with no prior frame.
  beginVelocityFrame(velocityField);
  const childCount = getNodeChildCount(root);
  for (let i = 0; i < childCount; i++) {
    const child = getNodeChildAt(root, i);
    if (child !== null) contributeVelocity(velocityField, child, 40, 0);
  }
  renderGlVelocity(state, root, velocityField, velocityTarget);
  setGlRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
}

// A few solid shapes spread across the frame. Velocity is contributed in render.webgl.ts (one static
// frame has no transform delta to derive motion from), so the scene here is just the geometry to smear.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);

// Luminance of a pixel (simple average of RGB channels).
function luminance(frame: Readonly<Bitmap>, x: number, y: number): number {
  const rgb = getBitmapPixelRgb(frame, x, y);
  return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
}

// Measure the horizontal transition width at a vertical edge: walk along a horizontal scanline and
// count how many pixels the luminance takes to travel from 10% to 90% of the full delta between
// background and square interior. A sharp edge gives 1–3px; a motion-blurred edge gives 15–40px.
function measureEdgeTransitionWidth(frame: Readonly<Bitmap>, y: number, xStart: number, xEnd: number): number {
  const step = xStart < xEnd ? 1 : -1;
  const count = Math.abs(xEnd - xStart);
  const values: number[] = [];
  for (let i = 0; i <= count; i++) values.push(luminance(frame, xStart + i * step, y));

  const lo = Math.min(values[0], values[values.length - 1]);
  const hi = Math.max(values[0], values[values.length - 1]);
  const delta = hi - lo;
  if (delta < 10) return 0;

  const threshold10 = lo + delta * 0.1;
  const threshold90 = lo + delta * 0.9;
  let first = -1;
  let last = -1;
  for (let i = 0; i < values.length; i++) {
    if (first < 0 && values[i] >= threshold10) first = i;
    if (values[i] <= threshold90) last = i;
  }
  return first >= 0 && last >= 0 ? Math.abs(last - first) : 0;
}

// The four squares' logical centers, matching the scene setup above. At pixelRatio=1 (headless),
// pixel coordinates equal logical coordinates.
const SQUARE_CENTERS = [
  { x: 200, y: 180 },
  { x: 600, y: 180 },
  { x: 200, y: 420 },
  { x: 600, y: 420 },
];
const SQUARE_HALF = 50;
const BG_LUM_CEIL = 30;
const MIN_SQUARE_LUM = 80;
const MIN_TRANSITION_WIDTH = 8;

export function assertRender(frame: Readonly<Bitmap>): void {
  // Gate 1: verify each square is present at its expected center. A wrong-shape or blank image fails
  // here with a positional diagnostic.
  for (let i = 0; i < SQUARE_CENTERS.length; i++) {
    const cx = SQUARE_CENTERS[i].x;
    const cy = SQUARE_CENTERS[i].y;
    const centerLum = luminance(frame, cx, cy);
    if (centerLum < MIN_SQUARE_LUM) {
      throw new Error(
        `[effect-motion-blur] square ${i} center (${cx},${cy}) luminance is ${centerLum.toFixed(0)} ` +
          `(expected >= ${MIN_SQUARE_LUM}) — colored square not found at expected position`,
      );
    }
    // Verify background is dark well outside the smear zone (40px beyond the square edge).
    const bgX = cx - SQUARE_HALF - 60;
    if (bgX >= 0) {
      const bgLum = luminance(frame, bgX, cy);
      if (bgLum > BG_LUM_CEIL) {
        throw new Error(
          `[effect-motion-blur] background at (${bgX},${cy}) luminance is ${bgLum.toFixed(0)} ` +
            `(expected <= ${BG_LUM_CEIL}) — unexpected content outside square region`,
        );
      }
    }
  }

  // Gate 2: measure horizontal transition width at left edges (the vertical edge the horizontal smear
  // softens). A blurred edge spans 15–40px; a sharp/inert edge spans 1–3px.
  let totalTransition = 0;
  let edgeCount = 0;
  for (const center of SQUARE_CENTERS) {
    const edgeX = center.x - SQUARE_HALF;
    const tw = measureEdgeTransitionWidth(frame, center.y, edgeX - 30, edgeX + 30);
    totalTransition += tw;
    edgeCount++;
  }
  const avgTransition = totalTransition / Math.max(1, edgeCount);

  if (avgTransition < MIN_TRANSITION_WIDTH) {
    throw new Error(
      `[effect-motion-blur] average horizontal edge transition is ${avgTransition.toFixed(1)}px ` +
        `(expected >= ${MIN_TRANSITION_WIDTH}px) — no horizontal smear detected; ` +
        `motion blur appears inert (sharp square edges with no gradient)`,
    );
  }
}
