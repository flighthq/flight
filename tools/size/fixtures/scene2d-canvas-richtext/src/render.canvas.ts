import { webHostCanvas } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  allocateEmptyCanvasRenderRegistries,
  canvasRichTextRenderer,
  endCanvasRenderPass,
  registerCanvasHost,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { appendRichTextString, createRichText, setRichTextDefaultTextFormat } from '@flighthq/text';
import { RichTextKind } from '@flighthq/types';

// REQUIRED WIRING for one rich text field, and nothing else:
//   surface   webHostCanvas — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  RichTextKind -> canvasRichTextRenderer
//   commands  NONE. RichText replays no shape command stream, so no command table is built.
//   resolvers an EMPTY CanvasTextureResolvers container. The Canvas backend rasterizes text through
//             the 2D context's own font machinery, so no texture resolver and no glyph atlas is
//             registered — the same reason the plain TextLabel fixture needs none.
//
// The marginal cost this isolates is RichText's span/format model over the plain TextLabel: the
// difference between this fixture and scene2d-canvas-text is the rich-text layer, not text rendering.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = allocateEmptyCanvasRenderRegistries();
const registry = {
  ...emptyRegistries,
  nodeRenderers: withKindMapEntry(emptyRegistries.nodeRenderers, RichTextKind, canvasRichTextRenderer),
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
const rich = createRichText();
setRichTextDefaultTextFormat(rich, { color: 0xff4d67ff, size: 48 });
appendRichTextString(rich, 'FLIGHT');
rich.x = 60;
rich.y = 40;
addNodeChild(root, rich);

prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasRichText', { registries, root });
endCanvasRenderPass(pass);
