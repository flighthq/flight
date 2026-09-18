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
  createEmptyGlRenderRegistry,
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlRichTextRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { createRichText } from '@flighthq/text';
import { RegistryEntryState, RichTextKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const emptyRegistries = createEmptyGlRenderRegistry();
const registry = {
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, RichTextKind, defaultGlRichTextRenderer),
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

const root = createDisplayObject();
const richText = createRichText({
  data: {
    background: true,
    backgroundColor: 0x163b63,
    border: true,
    borderColor: 0x5bbcff,
    defaultTextFormat: { color: 0xffffffff, font: 'sans-serif', size: 28 },
    height: 72,
    text: 'Rich text',
    width: 180,
  },
});
richText.x = 80;
richText.y = 70;
addNodeChild(root, richText);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineRichText', { registries, richText, root });
