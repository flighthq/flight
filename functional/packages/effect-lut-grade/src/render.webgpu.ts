import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createLookupTableGradeEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuLookupTableGradeEffectRunner,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuRenderEffect,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same full-frame lutGrade grade as render.webgl.ts: applies a 32^3 lookup-table grade at full strength.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'LookupTableGradeEffect', defaultWgpuLookupTableGradeEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createLookupTableGradeEffect({ size: 32, strength: 1 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
