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
  defaultCanvasTextLabelRenderer,
  getCanvasPipelineRegistries,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createTextLabel } from '@flighthq/text';
import { RegistryEntryState, TextLabelKind } from '@flighthq/types';

// REQUIRED WIRING for one text primitive, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  TextLabelKind -> defaultCanvasTextLabelRenderer
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

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, TextLabelKind, defaultCanvasTextLabelRenderer),
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
const label = createTextLabel();
label.data.text = 'FLIGHT';
label.data.textFormat = { color: 0xff4d67ff, size: 48 };
label.x = 60;
label.y = 40;
addNodeChild(root, label);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasText', { registries, root });
