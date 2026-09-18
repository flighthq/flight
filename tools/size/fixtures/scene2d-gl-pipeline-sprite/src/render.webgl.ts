import { webHostGl, createWebImageResourceFromCanvas, appendWebSurface } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
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
import { createGlSurface } from '@flighthq/surface';
import { createTexture } from '@flighthq/texture';
import { RegistryEntryState, SpriteKind } from '@flighthq/types';

const glSurface = createGlSurface(webHostGl, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const pipeline = createGlPipeline({
  ...createEmptyGlRegistries(),
  renderers: withRegistryTableEntry(createEmptyGlRegistries().renderers, SpriteKind, defaultGlSpriteRenderer),
});

const state = createGlRenderState(glSurface.context, pipeline, { pixelRatio: 1 });
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
sprite.data.texture = createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(source) });
sprite.x = 80;
sprite.y = 70;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineSprite', { registries, root, sprite });
