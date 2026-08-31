import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { appendQuadBatchInstance, createQuadBatch } from '@flighthq/quadbatch';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlQuadBatchRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { QuadBatchKind, RegistryEntryState } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, QuadBatchKind, defaultGlQuadBatchRenderer),
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
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);

const root = createDisplayObject();
const quadBatch = createQuadBatch();
const source = document.createElement('canvas');
source.width = 64;
source.height = 64;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL QuadBatch fixture requires a 2D texture source.');
sourceContext.fillStyle = '#5b8cff';
sourceContext.fillRect(0, 0, source.width, source.height);
quadBatch.data.atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 64, id: 0, width: 64 })],
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) }),
});
appendQuadBatchInstance(quadBatch, 0, 80, 70);
addNodeChild(root, quadBatch);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineQuadBatch', { quadBatch, registries, root });
