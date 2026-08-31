import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendPathRectangle, createPath, createPathMorph } from '@flighthq/path';
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
import { defaultGlMorphShapeRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import {
  appendMorphShapePath,
  appendShapeBeginFill,
  appendShapeEndFill,
  createMorphShape,
  setMorphShapeProgress,
} from '@flighthq/shape';
import { MorphShapeKind, RegistryEntryState } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL MorphShape size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, MorphShapeKind, defaultGlMorphShapeRenderer),
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
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineMorphShape', { morphShape, registries, root });
