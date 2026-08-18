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
  'An 800x600 field on a near-black background with four square tiles 140 px on a side, turned 12, 32, 52 and ' +
    '72 degrees so none sits square to the edges — a turned square covers more than its side, so they span 166, ' +
    '193, 197 and 176 px corner to corner (side*(cos a + sin a)): white centred near (224,180), warm yellow near ' +
    '(576,180), cyan near (224,420) and pink near (576,420). Each tile is bright and saturated at its core and ' +
    'carries a SOFT GLOW spilling outward past its edges into the dark background — the halo is the point, so ' +
    'four crisp-edged tiles with the background pure and unlit right up to each edge is the failure. THE GLOW IS ' +
    'FAINT ON THIS BACKEND, and how faint is derivable: the canvas bright pass applies contrast(1 + 6*threshold) ' +
    'followed by brightness(1 - threshold), and because CSS multiplies after the contrast stretch, every ' +
    'surviving bright pixel is scaled to 1 - 0.6 = 0.4 of its value; the composite then sets globalAlpha to the ' +
    'intensity, which Canvas 2D cannot take above 1, so the requested 1.4 becomes 1.0. The canvas halo therefore ' +
    'carries 0.4/1.4 = 0.29 of the energy the GL and WGPU siblings put into the same halo, where the bright pass ' +
    'is a hard step() that preserves magnitude and the composite multiplies by the full 1.4. Expect a glow that ' +
    'is unmistakable in a luminance profile and easy to miss by eye against the near-black field — measured just ' +
    'outside the white tile edge it peaks near 47/255 on canvas against 147/255 on webgl at the same pixel. A ' +
    'canvas picture as bright as the GL one would mean this backend had changed; a picture with NO gradient at ' +
    'all outside the silhouettes is still the failure. The glow falls off gradually rather than stopping at a ' +
    'line, it is the tile own colour rather than white, and it does not fill the field: the middle of the picture ' +
    'between the four tiles stays dark. The tiles do not overlap each other.',
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
