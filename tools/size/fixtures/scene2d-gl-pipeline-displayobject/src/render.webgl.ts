import { createAppWindow, openWindow } from '@flighthq/app';
import { webHostGl, appendWebSurface, webHostWindowGeometry, webHostWindowLifecycle } from '@flighthq/host-web';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  createGlRenderState,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { glScene2DRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { DisplayObjectKind } from '@flighthq/types';

// DisplayObject is a genuine non-visible container. This size-only control deliberately has no
// capture manifest: its one registered renderer traverses children but submits no geometry of its own.
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const registry = {
  nodeRenderers: withKindMapEntry(new Map(), DisplayObjectKind, glScene2DRenderer),
};
const state = createGlRenderState(glSurface.context, { ...registry, pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}

const root = createDisplayObject();
root.x = 40;
root.y = 30;

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineDisplayObject', { registries, root });
