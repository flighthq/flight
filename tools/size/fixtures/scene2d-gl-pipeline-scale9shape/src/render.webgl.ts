import { createRectangle } from '@flighthq/geometry';
import {
  createWebGlRenderSurfaceProvider,
  enableHostWebRaster2DSurface,
  webCanvasRenderSurfaceCreator,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { createCanvasShapeRasterizer, createCanvasTextureResolvers } from '@flighthq/scene2d-canvas';
import {
  defaultGlScale9ShapeRenderer,
  defaultGlShapeCommands,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  renderGlScene2D,
} from '@flighthq/scene2d-gl';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';
import { RegistryEntryState, Scale9ShapeKind } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL Scale9Shape size fixture requires a canvas render surface.');
enableHostWebRaster2DSurface();
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, Scale9ShapeKind, defaultGlScale9ShapeRenderer),
});
const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  pipeline,
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlShapeCommands(state, defaultGlShapeCommands);
registerGlShapeRasterizer(
  state,
  createCanvasShapeRasterizer(createCanvasTextureResolvers(webCanvasRenderSurfaceCreator)),
);

const root = createDisplayObject();
const scale9Shape = createScale9Shape(createRectangle(24, 20, 72, 60));
appendShapeBeginFill(scale9Shape, 0x8b5cf6ff);
appendShapeRectangle(scale9Shape, 0, 0, 120, 100);
appendShapeEndFill(scale9Shape);
scale9Shape.x = 80;
scale9Shape.y = 65;
scale9Shape.scaleX = 1.6;
scale9Shape.scaleY = 1.4;
addNodeChild(root, scale9Shape);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineScale9Shape', { registries, root, scale9Shape });
