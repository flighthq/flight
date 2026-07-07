import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendPathLineTo,
  appendPathMoveTo,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createClipRegionFromPath,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createPath,
  createShape,
  defaultGlBloomEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  enableGlClipSupport,
  endGlRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlRenderEffect,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  setDisplayObjectClip,
} from '@flighthq/sdk';

// Gl parity column: the same triangular contour clip inside an HDR (rgba16f) bloom pipeline. The
// contour clip is realized by a stencil pass, so the effect pipeline's scene target is created with a
// depth-stencil buffer (depth: 'depth-stencil').
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
enableGlClipSupport(state);
registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.4, intensity: 1.3 })]);
}

// A bright square masked by a TRIANGULAR (non-rectangular) contour clip, rendered through an HDR
// (rgba16float) effect pipeline. The contour clip is realized by a stencil pass, whose pipeline must
// match the effect target's color format — this is the regression test for the Wgpu clip-contour
// pipeline being keyed on the current color format (otherwise the stencil pipeline, built for the canvas
// rgba8 format, mismatches the rgba16float scene target and the frame is blank/invalid).

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const HALF = 150;
const shape = createShape();
appendShapeBeginFill(shape, 0x88ddffff, 1);
appendShapeRectangle(shape, -HALF, -HALF, HALF * 2, HALF * 2);
appendShapeEndFill(shape);
shape.x = logicalWidth / 2;
shape.y = logicalHeight / 2;

// Triangular contour clip in the shape's local space — a non-rectangular region, so it goes through the
// stencil contour path (not the scissor-rect fast path).
const clipPath = createPath();
appendPathMoveTo(clipPath, -HALF, HALF);
appendPathLineTo(clipPath, HALF, HALF);
appendPathLineTo(clipPath, 0, -HALF);
appendPathLineTo(clipPath, -HALF, HALF);
setDisplayObjectClip(shape, createClipRegionFromPath(clipPath));

addNodeChild(root, shape);
render(root);
