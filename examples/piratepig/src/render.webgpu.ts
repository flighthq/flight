import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGPURenderState,
  defaultWebGPUBitmapRenderer,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  defaultWebGPUTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  ShapeKind,
  submitWebGPURenderPass,
  TextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.appendChild(canvas);

export const container = canvas;
export const state = await createWebGPURenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerRenderer(state, TextKind, defaultWebGPUTextRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUDisplayObject(state, root);
  submitWebGPURenderPass(state);
}

// No WebGPU blur filter exists yet (filters-webgpu pending); the panel renders unblurred here.
// Once available, mirror render.webgl.ts: bake into a render cache, blur, composite.
export function applyBackgroundBlur(_node: DisplayObject): void {}
