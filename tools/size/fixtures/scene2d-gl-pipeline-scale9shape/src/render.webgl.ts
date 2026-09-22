import { createAppWindow, openWindow } from '@flighthq/app';
import { createRectangle } from '@flighthq/geometry';
import {
  webHostGl,
  webCanvasRenderSurfaceCreator,
  webImageSurfaceCreator,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  allocateEmptyGlRenderRegistries,
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  canvasShapeCommands,
  registerCanvasShapeCommands,
} from '@flighthq/scene2d-canvas';
import { glScale9ShapeRenderer, registerGlShapeRasterizer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';
import { createGlSurface } from '@flighthq/surface';
import { Scale9ShapeKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const emptyRegistries = allocateEmptyGlRenderRegistries();
const registry = {
  ...emptyRegistries,
  nodeRenderers: withKindMapEntry(emptyRegistries.nodeRenderers, Scale9ShapeKind, glScale9ShapeRenderer),
};
const state = createGlRenderState(glSurface.context, registry, {
  pixelRatio: 1,
  imageSurfaceProvider: webImageSurfaceCreator,
});
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}
registerCanvasShapeCommands(state, canvasShapeCommands);
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
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineScale9Shape', { registries, root, scale9Shape });
