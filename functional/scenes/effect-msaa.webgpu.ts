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
  getBitmapPixelRgb,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  enableWgpuRenderEffectGuards,
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
  'Four narrow colored bars (pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c) of 180×32 on dark background (0x101014), rotated 18°/42°/66°/90°. No post-process effects applied — empty effects array. Edges show visible aliasing stair-steps (sampleCount currently no-ops on Wgpu — the offscreen target is single-sampled).',
);

// Wgpu parity column for the MSAA reference scene. NOTE: sampleCount currently no-ops on the Wgpu
// effect pipeline (the offscreen scene target is single-sampled today) — wiring a multisampled Wgpu
// target is a follow-up, mirroring the Gl seam. We still render the same rotated shapes through the
// pipeline with an empty effect list so the column exists for visual comparison; its edges may alias
// more than Gl's until Wgpu MSAA lands.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
enableWgpuRenderEffectGuards(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Rotated, slightly-skewed filled shapes whose long diagonal edges alias badly without MSAA. Rendered
// through the effect pipeline at sampleCount 4, the edges should come out smooth.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -90, -16, 180, 32);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.25 * Math.floor(i / 2));
  shape.rotation = 18 + i * 24;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE, NOT OFF THE PICTURE: this scene builds its effect pipeline with
// `sampleCount: 4` and draws four filled bars rotated off-axis on a flat field, with an empty effects
// array. A multisampled resolve is the only thing in that description that can put a pixel at PARTIAL
// coverage — a fraction of a bar's colour blended with the field — so counting partial-luminance pixels
// along the diagonal edges measures exactly the one property the scene exists to show.
//
// The window sits between the two luminances the scene actually contains: the field is 0x101014
// (luminance about 17) and the dimmest bar channel average is well above 90, so nothing but an edge
// pixel can land inside it.
const PARTIAL_LOW = 20;
const PARTIAL_HIGH = 90;

function countPartialCoveragePixels(frame: Readonly<Bitmap>): number {
  let partial = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const luminance = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (luminance > PARTIAL_LOW && luminance < PARTIAL_HIGH) partial++;
    }
  }
  return partial;
}

// ★ THIS CELL ASSERTS THE ABSENCE ITS DESCRIPTION CLAIMS, and that is deliberate. Wgpu silently
// downgrades any sampleCount above 1 to 1, so the identical scene that antialiases on Gl comes out with
// hard stair-stepped edges here. Measured: 0 partial pixels, against 258 on Gl.
//
// If multisampling ever lands on Wgpu this assertion FAILS, which is the behaviour it should have — the
// description above says the edges are aliased, and a picture that quietly stopped matching its own
// description is worse than a red cell pointing at the file to update.
const MAX_ALIASED_EDGE_PIXELS = 40;

export function assertRender(frame: Readonly<Bitmap>): void {
  const partial = countPartialCoveragePixels(frame);
  if (partial > MAX_ALIASED_EDGE_PIXELS) {
    throw new Error(
      `[effect-msaa] ${partial} partial-coverage pixels (expected at most ${MAX_ALIASED_EDGE_PIXELS}) — ` +
        `the edges are antialiased, so sampleCount is no longer a no-op on Wgpu; update this cell and ` +
        `its description, which both state that it is`,
    );
  }
}
