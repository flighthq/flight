import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Node2D, Bitmap, WgpuRenderTarget } from '@flighthq/sdk';
import {
  CompositeOperator,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createCompositeEffect,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  createWgpuRenderTarget,
  registerWgpuCompositeEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  registerWgpuBlendEffectBackdrop,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 opaque black field with a single white rectangle occupying the TOP-LEFT quadrant — ' +
    'x 0-400, y 0-300 — and nothing else drawn anywhere. The rest of the field is pure black. The ' +
    'picture is the intersection of two white blocks: one covering the left half and one covering the ' +
    'top half, kept only where they overlap. The two regions where just ONE of them lay must be black: ' +
    'the top-right quadrant around x 600, y 150 is black even though a white block covered it, and so ' +
    'is the bottom-left. A picture showing an L-shape, or the full top half or left half in white, ' +
    'means the intersection was not taken. The white area has hard straight edges meeting at (400,300) ' +
    'with no gradient or grey fringe.',
);
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x000000ff,
});
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuCompositeEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba8' });
const backdropTarget: WgpuRenderTarget = createWgpuRenderTarget(
  state,
  state.surface.width,
  state.surface.height,
  state.format,
);
backdropTarget.clearColors = [0x00000000];

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

function fillRectangle(x: number, y: number, width: number, height: number): Node2D {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, 0, 0, width, height);
  appendShapeEndFill(shape);
  shape.x = x;
  shape.y = y;
  return shape;
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const backdropRoot = createDisplayObject();
backdropRoot.scaleX = scale;
backdropRoot.scaleY = scale;
addNodeChild(backdropRoot, fillRectangle(0, 0, logicalWidth * 0.5, logicalHeight));

const layerRoot = createDisplayObject();
layerRoot.scaleX = scale;
layerRoot.scaleY = scale;
addNodeChild(layerRoot, fillRectangle(0, 0, logicalWidth, logicalHeight * 0.5));

renderWgpuBackground(state);
if (prepareScene2DRender(state, backdropRoot)) {
  beginWgpuRenderPass(state, backdropTarget);
  renderWgpuScene2D(state, backdropRoot);
  endWgpuRenderPass(state);
}
registerWgpuBlendEffectBackdrop(state, 'scene', backdropTarget);

if (prepareScene2DRender(state, layerRoot)) {
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, layerRoot);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createCompositeEffect(CompositeOperator.SourceIn, { backdropKey: 'scene' }),
  ]);
}
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const near = (rgb: number, expected: number): boolean => {
    const red = (rgb >> 16) & 255;
    const green = (rgb >> 8) & 255;
    const blue = rgb & 255;
    return Math.abs(red - expected) <= 24 && Math.abs(green - expected) <= 24 && Math.abs(blue - expected) <= 24;
  };
  const sample = (x: number, y: number): number =>
    getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * y));
  const overlap = sample(0.25, 0.25);
  const sourceOnly = sample(0.75, 0.25);
  const backdropOnly = sample(0.25, 0.75);
  const hex = (rgb: number): string => (rgb & 0xffffffff).toString(16).padStart(6, '0');

  if (!near(overlap, 255)) {
    throw new Error(`[effect-composite] overlap is #${hex(overlap)}, expected SourceIn to retain the source`);
  }
  if (!near(sourceOnly, 0)) {
    throw new Error(`[effect-composite] source-only region is #${hex(sourceOnly)}, expected SourceIn to mask it out`);
  }
  if (!near(backdropOnly, 0)) {
    throw new Error(
      `[effect-composite] backdrop-only region is #${hex(backdropOnly)}, expected SourceIn to omit the backdrop`,
    );
  }
}
