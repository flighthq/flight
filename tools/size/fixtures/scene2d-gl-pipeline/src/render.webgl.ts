import { createWebGlContext } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createGlCanvasElement,
  createGlRenderState,
  enableGlBlendModeSupport,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerGlStandardMaterial, renderGlScene2D, scene2DGlPipeline } from '@flighthq/scene2d-gl';
import { RegistryEntryState } from '@flighthq/types';

const canvas = createGlCanvasElement(400, 300, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = createGlRenderState(
  createWebGlContext(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene2DGlPipeline,
  { pixelRatio: 1 },
);
const screenTarget = createGlScreenRenderTarget(state.gl);

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
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipeline', { registries, root });
