import type { GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  registerGlBloomEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

// Bloom: bright shapes on a dark background bleed glow through an HDR (rgba16f) pipeline. Pixels above
// the bright-pass threshold blur and add back, so the lit shapes gain a soft halo.
declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four square tiles 140 px on a side, turned 12, 32, 52 and ' +
    '72 degrees so none sits square to the edges — a turned square covers more than its side, so they span 166, ' +
    '193, 197 and 176 px corner to corner (side*(cos a + sin a)): white centred near (224,180), warm yellow near ' +
    '(576,180), cyan near (224,420) and pink near (576,420). Each tile is bright and saturated at its core and ' +
    'carries a SOFT GLOW spilling outward past its edges into the dark background — the halo is the point, so ' +
    'four crisp-edged tiles with the background pure and unlit right up to each edge is the failure. The glow ' +
    'falls off gradually rather than stopping at a line, it is the tile own colour rather than white, and it does ' +
    'not fill the field: the middle of the picture between the four tiles stays dark. The tiles do not overlap ' +
    'each other.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x05060aff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlBloomEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
}

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
