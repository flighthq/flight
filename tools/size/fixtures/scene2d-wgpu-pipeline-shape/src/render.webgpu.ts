import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostWgpuContext,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuShapeRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape';
import { createWgpuSurface } from '@flighthq/surface';
import { ShapeKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);

const registries = createEmptyWgpuRenderRegistries();
const registry = {
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, ShapeKind, defaultWgpuShapeRenderer),
};

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, registry, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;

const root = createDisplayObject();
const shape = createShape();
appendShapeBeginFill(shape, 0x45d483ff);
appendShapeRectangle(shape, 0, 0, 140, 90);
appendShapeEndFill(shape);
shape.x = 80;
shape.y = 70;
addNodeChild(root, shape);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuShape', { root, shape, state });
