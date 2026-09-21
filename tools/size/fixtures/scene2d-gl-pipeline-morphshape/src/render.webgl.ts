import { createAppWindow, openWindow } from '@flighthq/app';
import { webHostGl, appendWebSurface, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendPathRectangle, createPath, createPathMorph } from '@flighthq/path';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  allocateEmptyGlRenderRegistries,
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { glMorphShapeRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import {
  appendMorphShapePath,
  appendShapeBeginFill,
  appendShapeEndFill,
  createMorphShape,
  setMorphShapeProgress,
} from '@flighthq/shape';
import { createGlSurface } from '@flighthq/surface';
import { MorphShapeKind, RegistryEntryState } from '@flighthq/types';

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
  nodeRenderers: withRegistryTableEntry(emptyRegistries.nodeRenderers, MorphShapeKind, glMorphShapeRenderer),
};
const state = createGlRenderState(glSurface.context, registry, { pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, entry] of registries.nodeRenderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerNodeRenderer(state, kind, entry.value);
}

const start = createPath();
appendPathRectangle(start, 0, 0, 80, 70);
const end = createPath();
appendPathRectangle(end, 0, 0, 140, 44);
const morph = createPathMorph(start, end);
if (morph === null) throw new Error('The WebGL MorphShape fixture requires compatible paths.');

const root = createDisplayObject();
const morphShape = createMorphShape(morph);
appendShapeBeginFill(morphShape, 0xef5da8ff);
appendMorphShapePath(morphShape);
appendShapeEndFill(morphShape);
setMorphShapeProgress(morphShape, 0.5);
morphShape.x = 90;
morphShape.y = 80;
addNodeChild(root, morphShape);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineMorphShape', { morphShape, registries, root });
