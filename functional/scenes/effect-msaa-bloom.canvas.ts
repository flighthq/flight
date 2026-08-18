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
  'Four bright rotated rectangles (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 140×140 each in a 2×2 arrangement on near-black (0x05060a), rotated 27°/44°/61°/78°. Canvas 2D antialiases edges natively (no explicit MSAA). Soft glowing halos bleed outward from the bright shapes via bloom (threshold 0.6, intensity 1.4).',
);

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
