import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayContainer,
  createGodRaysEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuGodRaysEffectRunner,
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
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for god rays. The HDR rgba16f scene target is radially sampled from the light
// center; init is async so createWgpuRenderState is awaited.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'GodRaysEffect', defaultWgpuGodRaysEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createGodRaysEffect({
      centerX: 0.5,
      centerY: 0.4,
      density: 0.9,
      decay: 0.95,
      weight: 0.5,
      exposure: 0.4,
      samples: 64,
    }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// God rays radiate from a bright light center. A cluster of bright shapes surrounds the center point
// the effect samples toward, so the HDR pipeline can streak light outward from the occluded core.

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Bright core at the light center (centerX 0.5, centerY 0.4 in render.*.ts).
const core = createShape();
appendShapeBeginFill(core, 0xffffffff, 1);
appendShapeRectangle(core, -40, -40, 80, 80);
appendShapeEndFill(core);
core.x = logicalWidth * 0.5;
core.y = logicalHeight * 0.4;
addNodeChild(root, core);

const colors = [0xfff05cff, 0x5cffe0ff, 0xff5ce0ff, 0xffd45cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  const angle = (i / colors.length) * Math.PI * 2;
  shape.x = logicalWidth * 0.5 + Math.cos(angle) * logicalWidth * 0.28;
  shape.y = logicalHeight * 0.4 + Math.sin(angle) * logicalHeight * 0.28;
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);
