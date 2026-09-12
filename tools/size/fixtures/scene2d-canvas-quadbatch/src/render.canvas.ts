import { createWebImageResourceFromCanvas, webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendQuadBatchInstance, createQuadBatch } from '@flighthq/quadbatch';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasQuadBatchRenderer,
  endCanvasRenderPass,
  getCanvasPipelineRegistries,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  registerCanvasSurfaceCreator,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createTexture } from '@flighthq/texture';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { QuadBatchKind, RegistryEntryState } from '@flighthq/types';

// REQUIRED WIRING for one packed instanced-quad buffer, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  QuadBatchKind -> defaultCanvasQuadBatchRenderer
//   commands  NONE. A QuadBatch replays no shape command stream.
//   resolvers ONE image texture resolver. Every instance samples the batch's atlas, so unlike the
//             vector fixtures this genuinely needs a resolver — an empty container would resolve no
//             texture and the batch would draw nothing while still reporting a size.
//
// The atlas is built by hand from a single region rather than through a grid/packing helper, so the
// measured cost is the batch path plus one region, not an atlas-construction convenience.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, QuadBatchKind, defaultCanvasQuadBatchRenderer),
});

const screen = createCanvasScreenRenderTarget(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
);
const state = createCanvasRenderState(pipeline, createCanvasTextureResolvers(webCanvasRenderSurfaceCreator), {
  pixelRatio: 1,
});
registerCanvasSurfaceCreator(state, webCanvasRenderSurfaceCreator);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const source = document.createElement('canvas');
source.width = 32;
source.height = 32;
const sourceContext = source.getContext('2d')!;
sourceContext.fillStyle = '#ff4d67';
sourceContext.fillRect(0, 0, source.width, source.height);

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(source) }),
});
addTextureAtlasRegion(atlas, 0, 0, 32, 32);

const root = createDisplayObject();
const batch = createQuadBatch();
batch.data.atlas = atlas;
appendQuadBatchInstance(batch, 0, 0, 0);
appendQuadBatchInstance(batch, 0, 48, 24);
appendQuadBatchInstance(batch, 0, 96, 48);
batch.x = 60;
batch.y = 40;
addNodeChild(root, batch);

prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasQuadBatch', { registries, root });
endCanvasRenderPass(pass);
