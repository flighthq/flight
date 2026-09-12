import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderState,
  enableGlBlendModeSupport,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerGlStandardMaterial, renderGlScene2D, scene2DGlPipeline } from '@flighthq/scene2d-gl';
import { RegistryEntryState } from '@flighthq/types';

const canvas = createGlCanvasElement(400, 300, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  scene2DGlPipeline,
  { pixelRatio: 1, backgroundColor: 0x1a1a2eff },
);

const registries = getGlPipelineRegistries(scene2DGlPipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);
enableGlBlendModeSupport(state);

const root = createDisplayObject();
const sprite = createSprite();
sprite.x = 60;
sprite.y = 40;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipeline', { registries, root });
