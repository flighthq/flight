import { createWebGlRenderSurfaceProvider, webRaster2DSurfaceProvider } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlTextLabelRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTextLabel } from '@flighthq/text';
import { RegistryEntryState, TextLabelKind } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL TextLabel size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, TextLabelKind, defaultGlTextLabelRenderer),
});
const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  pipeline,
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1, raster2DSurfaceProvider: webRaster2DSurfaceProvider },
);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlStandardMaterial(state);

const root = createDisplayObject();
const textLabel = createTextLabel({
  data: {
    height: 64,
    text: 'Text label',
    textFormat: { color: 0xffca5bff, font: 'sans-serif', size: 32 },
    width: 220,
  },
});
textLabel.x = 80;
textLabel.y = 80;
addNodeChild(root, textLabel);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineTextLabel', { registries, root, textLabel });
