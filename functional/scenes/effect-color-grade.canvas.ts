import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createColorGradeAdjustment,
  createDisplayContainer,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

// Canvas parity column for the same color-grade intent as render.webgl.ts: saturation, contrast, and
// a warm temperature shift across the whole frame — realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

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
    createColorGradeAdjustment({ saturation: 1.5, contrast: 1.2, temperature: 0.2 }),
  ]);
}

// A spread of distinct, saturated colors so the grade's saturation/contrast/temperature shifts are
// visible across hues rather than on a single tone.

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3b30ff, 0x34c759ff, 0x007affff, 0xffcc00ff, 0xaf52deff, 0xff9500ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -60, -80, 120, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.18 + 0.32 * (i % 3));
  shape.y = logicalHeight * (0.32 + 0.4 * Math.floor(i / 3));
  addNodeChild(root, shape);
}

render(root);
