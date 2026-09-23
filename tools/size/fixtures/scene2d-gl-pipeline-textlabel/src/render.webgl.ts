import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostGl,
  webHostCanvas,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { glTextLabelRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { createTextLabel } from '@flighthq/text';
import { TextLabelKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const registry = {
  nodeRenderers: withKindMapEntry(new Map(), TextLabelKind, glTextLabelRenderer),
};
const state = createGlRenderState(glSurface.context, {
  ...registry,
  pixelRatio: 1,
  canvasHost: webHostCanvas,
});
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
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
