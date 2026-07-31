import type { Node2D, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlitchEffect,
  createShape,
  registerGlGlitchEffect,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Hashed horizontal block tears + per-channel RGB separation in one fullscreen pass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerGlStandardMaterial(state);
registerGlGlitchEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createGlitchEffect({ intensity: 0.7, blockSize: 22, colorShift: 12, seed: 3 }),
  ]);
}

// Bright horizontal colour bars — the structure glitch tears: each block of rows is displaced and the
// RGB channels separated, so the bars break into offset, colour-fringed segments. A clean, high-contrast
// scene makes the tear and channel-shift unmistakable.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3366ff, 0x33ff99ff, 0x3399ffff, 0xffcc33ff, 0xcc33ffff];
for (let i = 0; i < colors.length; i++) {
  const bar = createShape();
  appendShapeBeginFill(bar, colors[i], 1);
  appendShapeRectangle(bar, 0, 0, logicalWidth * 0.62, logicalHeight * 0.12);
  appendShapeEndFill(bar);
  bar.x = logicalWidth * 0.19;
  bar.y = logicalHeight * (0.1 + i * 0.16);
  addNodeChild(root, bar);
}

render(root);
