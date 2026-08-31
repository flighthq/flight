import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasRichTextRenderer,
  getCanvasPipelineRegistries,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { appendRichTextString, createRichText, setRichTextDefaultTextFormat } from '@flighthq/text';
import { RegistryEntryState, RichTextKind } from '@flighthq/types';

// REQUIRED WIRING for one rich text field, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  RichTextKind -> defaultCanvasRichTextRenderer
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

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, RichTextKind, defaultCanvasRichTextRenderer),
});

const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
  pipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}

const root = createDisplayObject();
const rich = createRichText();
setRichTextDefaultTextFormat(rich, { color: 0xff4d67ff, size: 48 });
appendRichTextString(rich, 'FLIGHT');
rich.x = 60;
rich.y = 40;
addNodeChild(root, rich);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasRichText', { registries, root });
