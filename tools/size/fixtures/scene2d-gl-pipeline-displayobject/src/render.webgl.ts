import { createWebHostTarget, webHostGl, webSurfaceCreateCapability } from '@flighthq/host-web';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlScene2DRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface, createSurface } from '@flighthq/surface';
import { DisplayObjectKind, RegistryEntryState } from '@flighthq/types';

// DisplayObject is a genuine non-visible container. This size-only control deliberately has no
// capture manifest: its one registered renderer traverses children but submits no geometry of its own.
const canvas = createSurface(webSurfaceCreateCapability, 400, 300);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const target = createWebHostTarget(canvas);
const glSurface = createGlSurface(webHostGl, target, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, DisplayObjectKind, defaultGlScene2DRenderer),
});
const state = createGlRenderState(glSurface.context, pipeline, { pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}

const root = createDisplayObject();
root.x = 40;
root.y = 30;

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineDisplayObject', { registries, root });
