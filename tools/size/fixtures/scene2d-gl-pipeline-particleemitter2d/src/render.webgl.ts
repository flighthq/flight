import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { createParticleEmitter2D } from '@flighthq/particleemitter';
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
import { defaultGlParticleEmitter2DRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { ParticleEmitter2DKind, RegistryEntryState } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL ParticleEmitter2D size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(
    emptyRegistries.renderers,
    ParticleEmitter2DKind,
    defaultGlParticleEmitter2DRenderer,
  ),
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

const source = document.createElement('canvas');
source.width = 32;
source.height = 32;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL ParticleEmitter2D fixture requires a 2D texture source.');
sourceContext.fillStyle = '#ffd95b';
sourceContext.fillRect(0, 0, source.width, source.height);
const atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 32, id: 0, width: 32 })],
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) }),
});

const root = createDisplayObject();
const emitter = createParticleEmitter2D({
  data: {
    alphas: new Float32Array([1, 0.8, 0.65]),
    atlas,
    colors: new Float32Array([1, 0.5, 0.2, 0.3, 0.8, 1, 1, 0.3, 0.7]),
    ids: new Uint16Array([0, 0, 0]),
    particleCount: 3,
    transforms: new Float32Array([0, 0, 0, 1, 48, 22, 0.2, 0.85, 92, -2, -0.2, 1.1]),
  },
});
emitter.x = 90;
emitter.y = 90;
addNodeChild(root, emitter);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineParticleEmitter2D', { emitter, registries, root });
