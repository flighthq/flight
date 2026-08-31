import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { appendParticleEmitter2DParticle, createParticleEmitter2D } from '@flighthq/particleemitter';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasParticleEmitter2DRenderer,
  getCanvasPipelineRegistries,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createTexture } from '@flighthq/texture';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { ParticleEmitter2DKind, RegistryEntryState } from '@flighthq/types';

// REQUIRED WIRING for one particle emitter node, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  ParticleEmitter2DKind -> defaultCanvasParticleEmitter2DRenderer
//   commands  NONE. An emitter replays no shape command stream.
//   resolvers ONE image texture resolver. Each particle samples a region of the emitter's atlas.
//
// ★ THIS MEASURES THE DISPLAY NODE, NOT THE SIMULATION. `@flighthq/particleemitter` is the drawable
// node; `@flighthq/particles` is the headless simulation, and nothing here imports it. Particles are
// placed directly with `appendParticleEmitter2DParticle` rather than stepped by a simulation, so the
// number is the cost of emitting and drawing a particle buffer — pulling the simulation in would make
// this fixture measure two features at once.
//
// `worldSpace` is left at its default so the renderer applies the node transform; the emitter is
// positioned like every other fixture's subject.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(
    emptyRegistries.renderers,
    ParticleEmitter2DKind,
    defaultCanvasParticleEmitter2DRenderer,
  ),
});

const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
  pipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const source = document.createElement('canvas');
source.width = 16;
source.height = 16;
const sourceContext = source.getContext('2d')!;
sourceContext.fillStyle = '#ff4d67';
sourceContext.fillRect(0, 0, source.width, source.height);

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) }),
});
addTextureAtlasRegion(atlas, 0, 0, 16, 16);

const root = createDisplayObject();
const emitter = createParticleEmitter2D();
emitter.data.atlas = atlas;
appendParticleEmitter2DParticle(emitter, 0, 0, 0, 0, 1);
appendParticleEmitter2DParticle(emitter, 0, 40, 20, 0.4, 1.5);
appendParticleEmitter2DParticle(emitter, 0, 80, 50, 0.8, 2);
emitter.x = 80;
emitter.y = 60;
addNodeChild(root, emitter);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasParticleEmitter2D', { registries, root });
