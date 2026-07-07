import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createLensDirtEffect,
  createShape,
  defaultGlLensDirtEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlRenderEffect,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
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
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'LensDirtEffect', defaultGlLensDirtEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createLensDirtEffect({ intensity: 1.5, threshold: 0.45, seed: 4 })]);
}

// Bright shapes on a dark field — lens dirt catches the light: the procedural smudge blobs only brighten
// where the scene luminance exceeds the threshold, so the dirt glows over the bright squares.

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Bright, near-white blocks so the dirt threshold (scene luminance) is exceeded and the smudges light up.
const colors = [0xffffffff, 0xfff0c0ff, 0xc0f0ffff, 0xffffffff];
for (let i = 0; i < colors.length; i++) {
  const block = createShape();
  appendShapeBeginFill(block, colors[i], 1);
  appendShapeRectangle(block, -80, -80, 160, 160);
  appendShapeEndFill(block);
  block.x = logicalWidth * (0.3 + 0.4 * (i % 2));
  block.y = logicalHeight * (0.32 + 0.38 * Math.floor(i / 2));
  addNodeChild(root, block);
}

render(root);
