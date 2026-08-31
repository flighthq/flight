import { createBitmapFont, createGlyphSourceFromBitmapFont } from '@flighthq/bitmapfont';
import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext';
import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
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
  registerGlImageTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlBitmapTextRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { BitmapTextKind, RegistryEntryState } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL BitmapText size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, BitmapTextKind, defaultGlBitmapTextRenderer),
});
const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  pipeline,
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);

const source = document.createElement('canvas');
source.width = 64;
source.height = 48;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL BitmapText fixture requires a 2D glyph source.');
sourceContext.fillStyle = '#ff5fa2';
sourceContext.fillRect(0, 0, 28, 40);
sourceContext.fillStyle = '#62d6ff';
sourceContext.fillRect(32, 0, 28, 40);

const font = createBitmapFont({
  glyphs: [
    { advance: 32, bearingX: 0, bearingY: 36, codepoint: 65, height: 40, width: 28, x: 0, y: 0 },
    { advance: 32, bearingX: 0, bearingY: 36, codepoint: 66, height: 40, width: 28, x: 32, y: 0 },
  ],
  metrics: { ascent: 36, descent: 4, lineGap: 4 },
  pages: [
    createTextureAtlas({
      texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) }),
    }),
  ],
});

const root = createDisplayObject();
const bitmapText = createBitmapText(createGlyphSourceFromBitmapFont(font), { letterSpacing: 2, text: 'ABBA' });
bitmapText.x = 80;
bitmapText.y = 90;
updateBitmapText(bitmapText);
addNodeChild(root, bitmapText);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineBitmapText', { bitmapText, registries, root });
