import { createWebHostTarget, webHostWgpuContext, webSurfaceCreateCapability } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuAcquisition,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerWgpuStandardMaterial, renderWgpuScene2D, scene2DWgpuPipeline } from '@flighthq/scene2d-wgpu';
import { createSurface } from '@flighthq/surface';
import { RegistryEntryState } from '@flighthq/types';

const canvas = createSurface(webSurfaceCreateCapability, 400, 300);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const target = createWebHostTarget(canvas);

const acquisition = await createWgpuAcquisition(webHostWgpuContext, target);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, target, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, scene2DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio: 1,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1], depth: 1.0 } as const;

const registries = scene2DWgpuPipeline.registries;
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
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
