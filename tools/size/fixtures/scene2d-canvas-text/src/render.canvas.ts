import { webHostCanvas } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  allocateEmptyCanvasRenderRegistries,
  canvasTextLabelRenderer,
  endCanvasRenderPass,
  registerCanvasHost,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createCanvasSurfaceFromNativeHandle } from '@flighthq/surface';
import { createTextLabel } from '@flighthq/text';
import { TextLabelKind } from '@flighthq/types';

// REQUIRED WIRING for one text primitive, and nothing else:
//   surface   webHostCanvas — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  TextLabelKind -> canvasTextLabelRenderer
//   commands  NONE. A TextLabel does not replay a shape command stream, so no command table is built
//             at all — not an empty one bound defensively, simply absent.
//   resolvers an EMPTY CanvasTextureResolvers container. Canvas draws text through the 2D context's
//             own font rasterization, so no texture resolver and no glyph atlas is registered.
//
// The Canvas backend measures and rasterizes text through the browser's 2D context, which is why this
// fixture needs no font/glyph-atlas wiring. A GL or WGPU text fixture would NOT be this small — that
// asymmetry is a property of the backend, not of the fixture.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = allocateEmptyCanvasRenderRegistries();
const registry = {
  ...emptyRegistries,
  nodeRenderers: withKindMapEntry(emptyRegistries.nodeRenderers, TextLabelKind, canvasTextLabelRenderer),
};

const screen = createCanvasScreenRenderTarget(createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas));
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

const root = createDisplayObject();
const label = createTextLabel();
label.data.text = 'FLIGHT';
label.data.textFormat = { color: 0xff4d67ff, size: 48 };
label.x = 60;
label.y = 40;
addNodeChild(root, label);

prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasText', { registries, root });
endCanvasRenderPass(pass);
