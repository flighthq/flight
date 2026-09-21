import { createAppWindow, openWindow } from '@flighthq/app';
import { webHostGl, appendWebSurface, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  createGlRenderState,
  enableGlBlendModeSupport,
  registerGlImageTextureResolver,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerGlStandardMaterial, renderGlScene2D, glScene2DRenderRegistries } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { RegistryEntryState } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const state = createGlRenderState(glSurface.context, glScene2DRenderRegistries, { pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = glScene2DRenderRegistries;
for (const [kind, entry] of registries.nodeRenderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerNodeRenderer(state, kind, entry.value);
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
