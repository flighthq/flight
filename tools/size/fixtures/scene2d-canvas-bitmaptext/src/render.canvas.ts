import { createBitmapFont, createGlyphSourceFromBitmapFont } from '@flighthq/bitmapfont';
import { createBitmapText, setBitmapTextText, updateBitmapText } from '@flighthq/bitmaptext';
import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
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
  defaultCanvasBitmapTextRenderer,
  getCanvasPipelineRegistries,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createTexture } from '@flighthq/texture';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { BitmapTextKind, RegistryEntryState } from '@flighthq/types';

// REQUIRED WIRING for one static bitmap-font text run, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  BitmapTextKind -> defaultCanvasBitmapTextRenderer
//   commands  NONE. BitmapText replays no shape command stream.
//   resolvers ONE image texture resolver. Every glyph is a blit from the font's atlas page.
//   glyphs    a BitmapFont behind the shared GlyphSource seam.
//
// ★ THIS IS THE STATIC HALF OF THE GLYPH SEAM, AND THAT IS THE POINT. `bitmapfont` serves prebuilt
// glyph pages; `glyphatlas` rasterizes on demand. Both satisfy GlyphSource, and a fixture that pulled
// the dynamic one would price a rasterizer this feature does not require. Nothing here imports
// `@flighthq/glyphatlas`.
//
// The font is built by hand from four glyphs rather than imported through `bitmapfont-formats`, so the
// measurement is the text path plus a font, not a font PARSER. Every codepoint in the string below has
// a glyph; a missing one would silently render nothing and still report a size.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, BitmapTextKind, defaultCanvasBitmapTextRenderer),
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
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const page = document.createElement('canvas');
page.width = 64;
page.height = 16;
const pageContext = page.getContext('2d')!;
pageContext.fillStyle = '#ff4d67';
for (let index = 0; index < 4; index += 1) {
  pageContext.fillRect(index * 16 + 2, 2, 12, 12);
}

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(page) }),
});
for (let index = 0; index < 4; index += 1) {
  addTextureAtlasRegion(atlas, index * 16, 0, 16, 16);
}

const codepoints = ['F', 'L', 'I', 'T'].map((character) => character.codePointAt(0)!);
const font = createBitmapFont({
  glyphs: codepoints.map((codepoint, index) => ({
    advance: 18,
    bearingX: 0,
    bearingY: 14,
    codepoint,
    height: 16,
    page: 0,
    width: 16,
    x: index * 16,
    y: 0,
  })),
  metrics: { ascent: 14, descent: 2, lineGap: 0 },
  pages: [atlas],
});

const root = createDisplayObject();
const label = createBitmapText(createGlyphSourceFromBitmapFont(font));
setBitmapTextText(label, 'FLIT');
label.x = 60;
label.y = 40;
// ★ THE LAYOUT PASS IS EXPLICIT, LIKE EVERY OTHER PASS IN FLIGHT. The renderer draws from the glyph
// page/instance buffers on the runtime, and `setBitmapTextText` only records the string — nothing
// lays it out on the caller's behalf. Without this call the node renders a blank frame while still
// building and still reporting a plausible size, which is exactly the failure a size number cannot
// show you.
updateBitmapText(label);
addNodeChild(root, label);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasBitmapText', { registries, root });
