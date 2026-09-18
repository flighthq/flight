import { createAppWindow, openWindow } from '@flighthq/app';
import { webHostGl, appendWebSurface, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRenderRegistries,
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlMeshShapeRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape';
import { createGlSurface } from '@flighthq/surface';
import { RegistryEntryState, ShapeKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const emptyRegistries = createEmptyGlRenderRegistries();
const registry = {
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, ShapeKind, defaultGlMeshShapeRenderer),
};
const state = createGlRenderState(glSurface.context, registry, { pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}

const root = createDisplayObject();
const shape = createShape();
appendShapeBeginFill(shape, 0x45d483ff);
appendShapeRectangle(shape, 0, 0, 120, 80);
appendShapeEndFill(shape);
shape.x = 80;
shape.y = 70;
addNodeChild(root, shape);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineShape', { registries, root, shape });
