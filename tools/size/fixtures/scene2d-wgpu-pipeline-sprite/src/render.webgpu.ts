import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuAcquisitionFromCanvasElement,
  createWgpuCanvasElement,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuImageTextureResolver,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { defaultWgpuSpriteRenderer, registerWgpuStandardMaterial, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { RegistryEntryState, SpriteKind } from '@flighthq/types';

enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(400, 300, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, SpriteKind, defaultWgpuSpriteRenderer),
});
const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1], depth: 1.0 } as const;

const registries = pipeline.registries;
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

Reflect.set(globalThis, '__flightScene2dWgpuPipelineSprite', { registries, root });
