import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D, RenderEffect } from '@flighthq/sdk';
import {
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  beginWgpuRenderEffectPipeline,
  createCanvasShapeRasterizer,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultWgpuShapeRenderer,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerRenderer,
  registerWgpuBloomEffect,
  registerWgpuShapeRasterizer,
  registerWgpuStandardMaterial,
  registerWgpuToneMapEffect,
  registerWgpuVignetteEffect,
  registerWgpuWhiteBalanceEffect,
  renderWgpuBackground,
  renderWgpuScene2D,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
});
enableFlightDiagnostics(state);

registerWgpuStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerWgpuShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerWgpuBloomEffect(state);
registerWgpuVignetteEffect(state);
registerWgpuToneMapEffect(state);
registerWgpuWhiteBalanceEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: Node2D, effects: readonly RenderEffect[]): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, effects);
  submitWgpuRenderPass(state);
}
