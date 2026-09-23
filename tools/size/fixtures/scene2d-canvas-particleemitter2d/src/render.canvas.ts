import { createWebImageResourceFromCanvas, webHostCanvas } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendParticleEmitter2DParticle, createParticleEmitter2D } from '@flighthq/particleemitter';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  allocateEmptyCanvasRenderRegistries,
  canvasParticleEmitter2DRenderer,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  registerCanvasHost,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createCanvasSurfaceFromNativeHandle } from '@flighthq/surface';
import { createTexture } from '@flighthq/texture';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { ParticleEmitter2DKind } from '@flighthq/types';

// REQUIRED WIRING for one particle emitter node, and nothing else:
//   surface   webHostCanvas — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  ParticleEmitter2DKind -> canvasParticleEmitter2DRenderer
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

const emptyRegistries = allocateEmptyCanvasRenderRegistries();
const registry = {
  ...emptyRegistries,
  nodeRenderers: withKindMapEntry(
    emptyRegistries.nodeRenderers,
    ParticleEmitter2DKind,
    canvasParticleEmitter2DRenderer,
  ),
};

const canvasSurface = createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas);
if (canvasSurface === null) throw new Error('Failed to create Canvas surface from element.');
const screen = createCanvasScreenRenderTarget(canvasSurface);
const state = createCanvasRenderState(registry, createCanvasTextureResolvers(webHostCanvas), {
  pixelRatio: 1,
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const source = document.createElement('canvas');
source.width = 16;
source.height = 16;
const sourceContext = source.getContext('2d')!;
sourceContext.fillStyle = '#ff4d67';
sourceContext.fillRect(0, 0, source.width, source.height);

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(source) }),
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
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasParticleEmitter2D', { registries, root });
endCanvasRenderPass(pass);
