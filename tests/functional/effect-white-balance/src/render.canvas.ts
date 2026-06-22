import type { DisplayObject } from '@flighthq/sdk';
import {
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createWhiteBalanceEffect,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasWhiteBalanceEffectRunner,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasRenderEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// Canvas note: whiteBalance is a documented Canvas passthrough — the Canvas 2D backend cannot express
// this color op, so its runner copies the scene through unchanged. The scene renders as-is here for
// parity with the Gl/Wgpu columns.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerCanvasRenderEffect(state, 'whiteBalance', defaultCanvasWhiteBalanceEffectRunner);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createWhiteBalanceEffect({ temperature: 0.4, tint: -0.2 })]);
}
