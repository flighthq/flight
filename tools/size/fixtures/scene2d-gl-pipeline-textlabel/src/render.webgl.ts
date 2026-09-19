import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostGl,
  webImageSurfaceCreator,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  allocateEmptyGlRenderRegistries,
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlTextLabelRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { createTextLabel } from '@flighthq/text';
import { RegistryEntryState, TextLabelKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const emptyRegistries = allocateEmptyGlRenderRegistries();
const registry = {
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, TextLabelKind, defaultGlTextLabelRenderer),
};
const state = createGlRenderState(glSurface.context, registry, {
  pixelRatio: 1,
  imageSurfaceProvider: webImageSurfaceCreator,
});
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlStandardMaterial(state);

const root = createDisplayObject();
const textLabel = createTextLabel({
  data: {
    height: 64,
    text: 'Text label',
    textFormat: { color: 0xffca5bff, font: 'sans-serif', size: 32 },
    width: 220,
  },
});
textLabel.x = 80;
textLabel.y = 80;
addNodeChild(root, textLabel);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineTextLabel', { registries, root, textLabel });
