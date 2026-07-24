import type { DisplayObject, Surface, WgpuRenderTarget } from '@flighthq/sdk';
import {
  AdvancedBlendMode,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createBlendEffect,
  createDisplayContainer,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuRenderTarget,
  defaultWgpuBlendEffectRunner,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getSurfacePixelRgb,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuBlendEffectBackdrop,
  registerWgpuRenderEffect,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x000000ff,
});
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'BlendEffect', defaultWgpuBlendEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const BACKDROP_KEY = 'scene';
const backdropTarget: WgpuRenderTarget = createWgpuRenderTarget(
  state,
  state.canvas.width,
  state.canvas.height,
  state.format,
);
backdropTarget.clearColors = [0x000000ff];

export function render(backdropRoot: DisplayObject, layerRoot: DisplayObject): void {
  renderWgpuBackground(state);

  if (prepareDisplayObjectRender(state, backdropRoot)) {
    beginWgpuRenderPass(state, backdropTarget);
    renderWgpuDisplayObject(state, backdropRoot);
    endWgpuRenderPass(state);
  }
  registerWgpuBlendEffectBackdrop(state, BACKDROP_KEY, backdropTarget);

  if (prepareDisplayObjectRender(state, layerRoot)) {
    beginWgpuRenderEffectPipeline(state, pipeline);
    renderWgpuDisplayObject(state, layerRoot);
    endWgpuRenderEffectPipeline(state, pipeline, [
      createBlendEffect(AdvancedBlendMode.Difference, { backdropKey: BACKDROP_KEY }),
    ]);
  }
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const logicalWidth = width / scale;
const logicalHeight = height / scale;

function fillRectangle(color: number, x: number, y: number, width: number, height: number): DisplayObject {
  const shape = createShape();
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, 0, 0, width, height);
  appendShapeEndFill(shape);
  shape.x = x;
  shape.y = y;
  return shape;
}

const backdropRoot = createDisplayContainer();
backdropRoot.scaleX = scale;
backdropRoot.scaleY = scale;
addNodeChild(backdropRoot, fillRectangle(0xffffffff, 0, 0, logicalWidth * 0.5, logicalHeight));

const layerRoot = createDisplayContainer();
layerRoot.scaleX = scale;
layerRoot.scaleY = scale;
addNodeChild(layerRoot, fillRectangle(0xffffffff, 0, 0, logicalWidth, logicalHeight * 0.5));

render(backdropRoot, layerRoot);

export function assertRender(surface: Readonly<Surface>): void {
  const isNear = (rgb: number, red: number, green: number, blue: number, tolerance: number): boolean => {
    const redDelta = ((rgb >> 16) & 255) - red;
    const greenDelta = ((rgb >> 8) & 255) - green;
    const blueDelta = (rgb & 255) - blue;
    return Math.abs(redDelta) <= tolerance && Math.abs(greenDelta) <= tolerance && Math.abs(blueDelta) <= tolerance;
  };
  const hex = (rgb: number): string => (rgb & 0xffffff).toString(16).padStart(6, '0');
  const topLeft = getSurfacePixelRgb(surface, Math.floor(surface.width * 0.25), Math.floor(surface.height * 0.25));
  const topRight = getSurfacePixelRgb(surface, Math.floor(surface.width * 0.75), Math.floor(surface.height * 0.25));
  const bottomLeft = getSurfacePixelRgb(surface, Math.floor(surface.width * 0.25), Math.floor(surface.height * 0.75));
  const bottomRight = getSurfacePixelRgb(surface, Math.floor(surface.width * 0.75), Math.floor(surface.height * 0.75));

  if (!isNear(topLeft, 0, 0, 0, 24)) {
    throw new Error(`[effect-blend-advanced] white overlap is #${hex(topLeft)}, expected Difference black`);
  }
  if (!isNear(topRight, 255, 255, 255, 24)) {
    throw new Error(`[effect-blend-advanced] layer-over-black is #${hex(topRight)}, expected white`);
  }
  if (!isNear(bottomLeft, 255, 255, 255, 24)) {
    throw new Error(`[effect-blend-advanced] backdrop-only is #${hex(bottomLeft)}, expected white`);
  }
  if (!isNear(bottomRight, 0, 0, 0, 24)) {
    throw new Error(`[effect-blend-advanced] empty region is #${hex(bottomRight)}, expected black`);
  }
}
