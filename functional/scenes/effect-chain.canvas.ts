import type { DisplayObject } from '@flighthq/sdk';
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
  createColorGradeEffect,
  createDisplayContainer,
  createShape,
  createVignetteEffect,
  defaultCanvasBloomEffectRunner,
  defaultCanvasColorGradeEffectRunner,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasVignetteEffectRunner,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasRenderEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

// Canvas parity column for the same three-stage chain as render.webgl.ts: bloom, then color grade,
// then vignette. The Canvas pipeline composites each registered runner in order over the scene, the
// same RenderEffect stack intent realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerCanvasRenderEffect(state, 'BloomEffect', defaultCanvasBloomEffectRunner);
registerCanvasRenderEffect(state, 'ColorGradeEffect', defaultCanvasColorGradeEffectRunner);
registerCanvasRenderEffect(state, 'VignetteEffect', defaultCanvasVignetteEffectRunner);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeEffect({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}

// Bright, saturated shapes on a near-black field feed a three-stage effect chain: their high
// luminance crosses the bloom threshold for a glowing halo, the color grade pushes saturation and
// contrast, and the vignette darkens the corners.

const root = createDisplayContainer();
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
