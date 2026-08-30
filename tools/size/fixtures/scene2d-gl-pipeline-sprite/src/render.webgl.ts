import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { defaultGlSpriteRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { RegistryEntryState, SpriteKind } from '@flighthq/types';

const canvas = createGlCanvasElement(400, 300, 1);
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

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);

const root = createDisplayObject();
const sprite = createSprite();
sprite.x = 60;
sprite.y = 40;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineSprite', { registries, root });
