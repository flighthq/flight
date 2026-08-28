import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
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
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'A white 80×80 square centered at (400,240) surrounded by four colored 100×100 squares (yellow 0xfff05c at ' +
    '(624,240), cyan 0x5cffe0 at (400,408), magenta 0xff5ce0 at (176,240), orange 0xffd45c at (400,72)) on a ' +
    'near-black 800×600 background (0x05060a), each rotated 12°/32°/52°/72°. Radial light streaks emanate outward ' +
    'from the central white core at (400,240) — the point centerY = 0.4 names, measured from the TOP edge per the ' +
    'GodRaysEffect contract — through the dark areas between and beyond the shapes, fading with distance. The ' +
    'streaks leaving the frame are brightest near that row on both backends, and a picture whose brightest edge ' +
    'streaks sit near y = 360 instead is the failure this cell now exists to catch: that is where the light lands ' +
    'if a backend forwards centerY into a bottom-origin texture space rather than normalising it. A uniformly ' +
    'dark frame with no radial streaks reaching the edges is a failure.',
);

// Wgpu parity column for god rays. The HDR rgba16f scene target is radially sampled from the light
// center; init is async so createWgpuRenderState is awaited.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuGodRaysEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// The light position the effect is given AND the row the assertion derives its axis from. One
// constant so the two cannot drift apart: an assertion that hard-codes the same number separately
// keeps passing when the descriptor changes. `centerY` is top-left-origin per GodRaysEffect.
const LIGHT_CENTER_Y = 0.4;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createGodRaysEffect({
      centerX: 0.5,
      centerY: LIGHT_CENTER_Y,
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
  // ★ THIS ASSERTS WHERE THE RAY AXIS IS, NOT THAT SOME FIXED ROW IS LIT. The previous version probed
  // y = 0.4*height and required luminance > 8. That passed on Gl for the wrong reason: Gl's light sat at
  // 0.6*height because `centerY` was forwarded into a bottom-origin texture space, so the probe was a
  // long way OFF the axis and still lit, because the rays are broad. An assertion that cannot tell "the
  // axis is here" from "something near here is bright" cannot detect the axis moving — which is exactly
  // the defect that shipped. Scanning for the brightest row and comparing it against the row `centerY`
  // names is what makes the claim falsifiable.
  const x = frame.width - 10;
  const axisY = Math.round(frame.height * LIGHT_CENTER_Y);

  let brightestY = -1;
  let brightestLum = -1;
  for (let y = 0; y < frame.height; y += 2) {
    const px = getBitmapPixelRgb(frame, x, y);
    const lum = 0.299 * ((px >> 16) & 0xff) + 0.587 * ((px >> 8) & 0xff) + 0.114 * (px & 0xff);
    if (lum > brightestLum) {
      brightestLum = lum;
      brightestY = y;
    }
  }

  if (brightestLum <= 8) {
    throw new Error(
      `[effect-god-rays] far edge is dark everywhere (brightest luminance ${brightestLum.toFixed(1)} at ` +
        `y=${brightestY}, expected > 8) — god ray streaks are not reaching the edges`,
    );
  }

  // The rays fan out AND the scene's four surrounding shapes each throw their own ray, so the brightest
  // far-edge pixel sits near the axis rather than on it: measured 186 (gl) and 204 (wgpu) against an
  // axis of 240. The tolerance covers that spread with margin and is still only ~60% of the 120 px error
  // it exists to catch — the origin mismatch put the axis at 360, which fails this by 48 px.
  const tolerance = Math.round(frame.height * 0.12);
  if (Math.abs(brightestY - axisY) > tolerance) {
    throw new Error(
      `[effect-god-rays] ray axis is at y=${brightestY} but centerY ${LIGHT_CENTER_Y} puts it at ` +
        `y=${axisY} (tolerance ${tolerance}) — the light is not where the descriptor places it, which is ` +
        `what a texture-space origin mismatch looks like`,
    );
  }
}
