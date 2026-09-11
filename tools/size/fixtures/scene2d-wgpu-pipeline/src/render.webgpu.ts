import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import { registerWgpuStandardMaterial, renderWgpuScene2D, scene2DWgpuPipeline } from '@flighthq/scene2d-wgpu';
import { RegistryEntryState } from '@flighthq/types';

enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(400, 300, 1);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2DWgpuPipeline, {
  backgroundColor: 0x1a1a2eff,
  pixelRatio: 1,
});

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
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);
canvas.style.outline = '4px solid #ff4d67';

Reflect.set(globalThis, '__flightScene2dWgpuPipeline', { registries, root });
