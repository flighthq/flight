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

// Canvas parity column for the same bloom intent as render.webgl.ts: bright shapes on a dark
// background bleed glow. The Canvas bloom recipe bright-passes and blurs via ctx.filter, then adds
// the glow back over the scene — the same RenderEffect intent realized with Canvas 2D compositing.
declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four square tiles of about 140 px, each turned by ' +
    'a different small angle so none sits square to the edges: white centred near (224,180), warm ' +
    'yellow near (576,180), cyan near (224,420) and pink near (576,420). Each tile is bright and ' +
    'saturated at its core and carries a SOFT GLOW spilling outward past its edges into the dark ' +
    'background — the halo is the point, so four crisp-edged tiles with the background pure and unlit ' +
    'right up to each edge is the failure. The glow falls off gradually rather than stopping at a line, ' +
    'it is the tile own colour rather than white, and it does not fill the field: the middle of the ' +
    'picture between the four tiles stays dark. The tiles do not overlap each other.',
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

// Bright, saturated shapes on a near-black field. Their high luminance crosses the bloom threshold,
// so each shape should pick up a soft glowing halo.

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
