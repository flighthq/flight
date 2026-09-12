import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
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
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { defaultGlSpriteRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTexture } from '@flighthq/texture';
import { RegistryEntryState, SpriteKind } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const pipeline = createGlPipeline({
  ...createEmptyGlRegistries(),
  renderers: withRegistryTableEntry(createEmptyGlRegistries().renderers, SpriteKind, defaultGlSpriteRenderer),
});

const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  pipeline,
  { pixelRatio: 1, backgroundColor: 0x1a1a2eff },
);
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);

const root = createDisplayObject();
const sprite = createSprite();
const source = document.createElement('canvas');
source.width = 64;
source.height = 64;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL Sprite fixture requires a 2D texture source.');
sourceContext.fillStyle = '#ff4d67';
sourceContext.fillRect(0, 0, source.width, source.height);
sprite.data.texture = createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) });
sprite.x = 80;
sprite.y = 70;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineSprite', { registries, root, sprite });
