import { createWebImageResourceFromCanvas, webHostCanvas } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import { createDisplayObject, createSprite } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  allocateEmptyCanvasRenderRegistries,
  canvasSpriteRenderer,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  registerCanvasHost,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createCanvasSurfaceFromNativeHandle } from '@flighthq/surface';
import { createTexture } from '@flighthq/texture';
import { SpriteKind } from '@flighthq/types';

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = allocateEmptyCanvasRenderRegistries();
const registry = {
  ...emptyRegistries,
  nodeRenderers: withKindMapEntry(emptyRegistries.nodeRenderers, SpriteKind, canvasSpriteRenderer),
};
const canvasSurface = createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas);
if (canvasSurface === null) throw new Error('Failed to create Canvas surface from element.');
const screen = createCanvasScreenRenderTarget(canvasSurface);
const state = createCanvasRenderState(registry, createCanvasTextureResolvers(webHostCanvas), {
  pixelRatio: 1,
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const root = createDisplayObject();
const sprite = createSprite();
const source = document.createElement('canvas');
source.width = 32;
source.height = 32;
const sourceContext = source.getContext('2d')!;
sourceContext.fillStyle = '#ff4d67';
sourceContext.fillRect(0, 0, source.width, source.height);
sprite.data.texture = createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(source) });
sprite.x = 60;
sprite.y = 40;
addNodeChild(root, sprite);

prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasPipelineSprite', { registries, root });
endCanvasRenderPass(pass);
