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
  createLensFlareEffect,
  createShape,
  getBitmapPixelRgb,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuLensFlareEffect,
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
  'Four bright rotated rectangles (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 140×140 each in a 2×2 arrangement on near-black (0x05060a), rotated 12°/32°/52°/72°. Semi-transparent ghost images mirrored through the frame center and a displaced halo arc from the HDR lens flare (threshold 0.7, 5 ghosts, halo 0.4, rgba16f pipeline). Bright shapes above the threshold seed the flare artifacts. A frame with only the four rectangles and no ghost/halo artifacts between them is a failure. ' +
    'The four FRAME CORNERS are lit, and that is the ghost chain rather than an artifact: the recipe walks ' +
    'each ghost along the line from the sampled pixel through the frame centre, so from a corner that line ' +
    'runs diagonally across the field and through the tiles on it. Measured means are about 192 at the ' +
    'top-left corner and 140 to 153 at the other three, while the MIDPOINTS of the top and left edges stay at ' +
    'the near-black background exactly, because no ghost line from there reaches a tile. A picture with dark ' +
    'corners has lost the ghosts, and a picture with lit edge midpoints is spilling light where the recipe ' +
    'places none.',
);

// Wgpu parity column for the same lens-flare intent as render.webgl.ts, also using the HDR
// (rgba16f) scene target so bright spots seed ghosts and the halo.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuLensFlareEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createLensFlareEffect({ threshold: 0.7, intensity: 1.6, ghosts: 5, halo: 0.4 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Bright, saturated shapes on a near-black field — high luminance to seed lens-flare ghosts and halo.

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

// ★ READ OFF THE SOURCE: the recipe walks up to `ghosts` samples along the line from each pixel through
// the frame centre — `uv + (0.5 - uv) * 2t` for t = i/(ghosts+1) — and adds the bright pass of whatever
// it finds. So the lit regions are PREDICTABLE from the tile geometry, and the check reads two places
// the prediction separates: the four corners, whose ghost lines cross the tiles, and the midpoints of
// the top and left edges, whose lines do not reach one.
//
// Predicted taps per pixel against measured mean luminance, computed from the shader's own arithmetic
// and compared with the render:
//
//     top-left corner        2.42 taps    191.96
//     bottom-right corner    2.50 taps    153.40
//     top-right corner       2.03 taps    147.98
//     bottom-left corner     2.04 taps    140.36
//     top edge midpoint      0.00 taps      7.00     the background, exactly
//     left edge midpoint     0.00 taps      7.00
//
// Across the whole frame, restricted to pixels outside every tile: 2662 pixels with a predicted ghost
// average 124.98, and 3606 without average 9.79. The lit areas ARE the predicted ghosts.
//
// The corner brightness was investigated as a possible artifact and is not one. It also does not move
// when the halo's normalization bias is removed — measured byte-identical with and without — so it is
// the ghost chain, not the halo.
const MIN_CORNER_MEAN = 60;
const MAX_EDGE_MIDPOINT_MEAN = 15;
const PROBE = 60;

export function assertRender(frame: Readonly<Bitmap>): void {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };
  const meanOf = (x0: number, y0: number, x1: number, y1: number): number => {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        sum += luminance(x, y);
        count++;
      }
    }
    return count === 0 ? 0 : sum / count;
  };

  const corners: Array<[string, number]> = [
    ['top-left', meanOf(0, 0, PROBE, PROBE)],
    ['top-right', meanOf(frame.width - PROBE, 0, frame.width, PROBE)],
    ['bottom-left', meanOf(0, frame.height - PROBE, PROBE, frame.height)],
    ['bottom-right', meanOf(frame.width - PROBE, frame.height - PROBE, frame.width, frame.height)],
  ];
  for (const [name, mean] of corners) {
    if (mean < MIN_CORNER_MEAN) {
      throw new Error(
        `[effect-lens-flare] the ${name} corner reads ${mean.toFixed(2)} (expected at least ` +
          `${MIN_CORNER_MEAN}) — its ghost line crosses the tiles, so it must carry ghost light`,
      );
    }
  }

  // The paired negative: no ghost line from an edge midpoint reaches a tile, so light there is spill
  // the recipe does not place. Without this, "the corners are bright" passes on a uniformly lit frame.
  const edges: Array<[string, number]> = [
    ['top', meanOf(Math.round(frame.width / 2) - 40, 0, Math.round(frame.width / 2) + 40, PROBE)],
    ['left', meanOf(0, Math.round(frame.height / 2) - 30, PROBE, Math.round(frame.height / 2) + 30)],
  ];
  for (const [name, mean] of edges) {
    if (mean > MAX_EDGE_MIDPOINT_MEAN) {
      throw new Error(
        `[effect-lens-flare] the ${name} edge midpoint reads ${mean.toFixed(2)} (expected at most ` +
          `${MAX_EDGE_MIDPOINT_MEAN}) — no ghost line from there reaches a tile, so this is spill`,
      );
    }
  }
}
