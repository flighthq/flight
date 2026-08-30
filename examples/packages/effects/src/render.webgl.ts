import type { Node2D, RenderEffect } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  beginGlRenderEffectPipeline,
  createCanvasShapeRasterizer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultGlShapeRenderer,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerGlBloomEffect,
  registerGlShapeRasterizer,
  registerGlStandardMaterial,
  registerGlToneMapEffect,
  registerGlVignetteEffect,
  registerGlWhiteBalanceEffect,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x0a0c14ff,
  },
);
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers();
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerGlBloomEffect(state);
registerGlVignetteEffect(state);
registerGlToneMapEffect(state);
registerGlWhiteBalanceEffect(state);

const pipeline = createGlRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: Node2D, effects: readonly RenderEffect[]): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, effects);
}
