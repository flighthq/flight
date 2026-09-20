import { createAppWindow, openWindow } from '@flighthq/app';
import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext';
import { createGlyphAtlas, createGlyphSourceFromGlyphAtlas } from '@flighthq/glyphatlas';
import {
  webHostWgpuContext,
  webHostGlyphRasterizer,
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
  registerWgpuBitmapTextureResolver,
} from '@flighthq/render-wgpu';
import { allocateEmptyWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { wgpuBitmapTextRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createWgpuSurface } from '@flighthq/surface';
import { BitmapTextKind, StandardMaterialKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);

const registries = allocateEmptyWgpuRenderRegistries();
const registry = {
  ...registries,
  materialRenderers: withRegistryTableEntry(
    registries.materialRenderers,
    StandardMaterialKind,
    standardWgpuMaterialRenderer,
  ),
  renderers: withRegistryTableEntry(registries.renderers, BitmapTextKind, wgpuBitmapTextRenderer),
};

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, registry, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
registerWgpuBitmapTextureResolver(state);

const atlas = createGlyphAtlas({
  fontFamily: 'sans-serif',
  fontSize: 42,
  height: 128,
  rasterizerBackend: webHostGlyphRasterizer,
  width: 256,
});
const root = createDisplayObject();
const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { letterSpacing: 2, text: 'Bitmap' });
updateBitmapText(text);
text.x = 64;
text.y = 84;
addNodeChild(root, text);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuBitmapText', { root, state, text });
