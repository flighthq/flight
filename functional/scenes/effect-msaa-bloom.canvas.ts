import type { Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createBloomEffect,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createDisplayObject,
  createShape,
  registerCanvasBloomEffect,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'Four bright rotated rectangles (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 140×140 ' +
    'each in a 2×2 arrangement on near-black (0x05060a), rotated 27°/44°/61°/78°. Canvas 2D antialiases edges ' +
    'natively (no explicit MSAA). Soft glowing halos bleed outward from the bright shapes via bloom (threshold ' +
    '0.6, intensity 1.4). THE GLOW IS FAINT ON THIS BACKEND, and how faint is derivable: the canvas bright pass ' +
    'scales every surviving pixel to 1 - threshold = 0.4 of its value (CSS applies brightness after the contrast ' +
    'stretch), and the composite sets globalAlpha to the intensity, which Canvas 2D cannot take above 1, so the ' +
    'requested 1.4 becomes 1.0. The canvas halo therefore carries 0.4/1.4 = 0.29 of the energy the GL and WGPU ' +
    'siblings put into the same halo. Expect a glow that reads clearly in a luminance profile and is easy to miss ' +
    'by eye against the near-black field; a picture with no gradient at all outside the silhouettes is still the ' +
    'failure. This ratio is derived from the two scaling terms, not measured on this cell — the sibling scene ' +
    'effect-bloom/canvas is the one where it was measured, peaking near 47/255 just outside a tile edge against ' +
    '147/255 on webgl at the same pixel.',
);

// Canvas parity column for the MSAA + bloom scene. Canvas 2D antialiases edges natively, so there is
// no explicit sampleCount seam here; the column still runs the bloom scene2d over the scene so the same
// bright shapes pick up a glowing halo for visual comparison against the Gl MSAA + bloom result.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasBloomEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
}

// Bright rotated shapes on a near-black field: their steep diagonal edges expose jaggies that MSAA
// should resolve smooth, while their high luminance crosses the bloom threshold for a glowing halo —
// so the scene exercises MSAA resolve and effect compose at once.

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
  shape.rotation = 27 + i * 17;
  addNodeChild(root, shape);
}

render(root);
