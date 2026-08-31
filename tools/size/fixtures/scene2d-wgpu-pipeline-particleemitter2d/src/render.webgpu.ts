import { createBitmap } from '@flighthq/bitmap';
import { createWebWgpuRenderSurfaceProvider } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendParticleEmitter2DParticle, createParticleEmitter2D } from '@flighthq/particleemitter';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  createWgpuPipeline,
  createWgpuRenderStateFromCanvasElement,
  registerWgpuBitmapTextureResolver,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuParticleEmitter2DRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { ParticleEmitter2DKind } from '@flighthq/types';

const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU ParticleEmitter2D size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
registerWgpuBitmapTextureResolver(state);

const atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 48, id: 0, width: 48 })],
  texture: createTexture({ dimension: '2d', source: createBitmap(48, 48, 0x5b8cffff) }),
});
const root = createDisplayObject();
const emitter = createParticleEmitter2D({ data: { atlas } });
appendParticleEmitter2DParticle(emitter, 0, 70, 60, -0.2, 1.2);
appendParticleEmitter2DParticle(emitter, 0, 135, 95, 0.25, 0.9);
appendParticleEmitter2DParticle(emitter, 0, 195, 45, 0.1, 1.1);
emitter.x = 20;
emitter.y = 35;
addNodeChild(root, emitter);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuParticleEmitter2D', { emitter, root, state });
