import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostWgpuContext,
  webImageSurfaceCreator,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createDisplayObject } from '@flighthq/scene2d';
import { wgpuTextLabelRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuQuadMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createWgpuSurface } from '@flighthq/surface';
import { createTextLabel } from '@flighthq/text';
import { StandardMaterialKind, TextLabelKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);

const registry = {
  materialRenderers: withKindMapEntry(new Map(), StandardMaterialKind, standardWgpuQuadMaterialRenderer),
  nodeRenderers: withKindMapEntry(new Map(), TextLabelKind, wgpuTextLabelRenderer),
};

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, {
  ...registry,
  format: acquisition.format,
  pixelRatio: 1,
  imageSurfaceProvider: webImageSurfaceCreator,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;

const root = createDisplayObject();
const text = createTextLabel({
  data: {
    height: 80,
    text: 'TextLabel',
    textFormat: { color: 0xffd166ff, font: 'sans-serif', size: 36 },
    width: 220,
  },
});
text.x = 52;
text.y = 78;
addNodeChild(root, text);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuTextLabel', { root, state, text });
