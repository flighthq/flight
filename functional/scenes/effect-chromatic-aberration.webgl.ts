import type { Node2D, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createChromaticAberrationEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  registerGlChromaticAberrationEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Chromatic aberration: the R/G/B channels are sampled with a growing radial offset toward the edges,
// fringing high-contrast borders. Sharp edges away from center show the red/blue split clearly.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlChromaticAberrationEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createChromaticAberrationEffect({ intensity: 4, radial: true })]);
}

// High-contrast white shapes on a dark field, pushed toward the corners where radial aberration is
// strongest. The crisp edges make the per-channel color fringing easy to see.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const positions = [
  [0.16, 0.2],
  [0.84, 0.2],
  [0.16, 0.8],
  [0.84, 0.8],
  [0.5, 0.5],
];
for (let i = 0; i < positions.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = i * 15;
  addNodeChild(root, shape);
}

render(root);
