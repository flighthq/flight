import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlRenderState,
  enableGlBlendModeSupport,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerGlStandardMaterial, renderGlScene2D, scene2dGlPipeline } from '@flighthq/scene2d-gl';

const canvas = createGlCanvasElement(400, 300, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  { pixelRatio: 1, backgroundColor: 0x1a1a2eff },
);

const registries = getGlPipelineRegistries(scene2dGlPipeline);
for (const [kind, entry] of registries.renderers.entries) {
  registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);
enableGlBlendModeSupport(state);

const root = createDisplayObject();
const sprite = createSprite();
sprite.x = 60;
sprite.y = 40;
sprite.width = 280;
sprite.height = 220;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipeline', { registries, root });
