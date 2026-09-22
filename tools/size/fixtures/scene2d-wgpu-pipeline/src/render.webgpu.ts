import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostWgpuContext,
  appendWebSurface,
  getWebSurfaceElement,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerWgpuStandardMaterial, renderWgpuScene2D, wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu';
import { createWgpuSurface } from '@flighthq/surface';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 400, 300);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
appendWebSurface(wgpuSurface, document.body);
const canvas = getWebSurfaceElement(wgpuSurface)!;
const acquisition = wgpuSurface.acquisition;
document.body.style.margin = '0';

export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, {
  ...wgpuScene2DRenderPreset,
  format: acquisition.format,
  pixelRatio: 1,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1], depth: 1.0 } as const;

const registries = wgpuScene2DRenderPreset;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}
registerWgpuImageTextureResolver(state);
registerWgpuStandardMaterial(state);

const root = createDisplayObject();
const sprite = createSprite();
sprite.x = 60;
sprite.y = 40;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);
canvas.style.outline = '4px solid #ff4d67';

Reflect.set(globalThis, '__flightScene2dWgpuPipeline', { registries, root });
