// scene2d-cache — validates the render-cache (cacheAsBitmap) path: a small subtree is baked once into an
// offscreen render target with createRenderCache() + refresh*RenderCache(), then useRenderCache() opts the
// subtree's node into that cache so the screen pass composites the baked image instead of re-traversing the
// subtree. The visible result must be identical to drawing the subtree directly — that is what this proves.
//
// Render caching is invisible to unit tests: only a real render can show that the composited cache produces
// the same pixels the live subtree would. The subtree here is a container holding two filled rectangles (a
// magenta one and a green one). The scene assertion samples each rectangle's center (expecting its color) and an
// empty gap (expecting background), so a cache that bakes nothing, mis-places, or mis-colors the result
// fails.
//
// The engine bake (offscreen cache state + refresh) is driven from outside the harness frame loop.
// Canvas, WebGL, and WebGPU all support that contract; WebGPU opens a standalone command encoder for the
// bake and submits it before the visible frame. DOM rasterizes its cache canvas inside its own frame, so
// this shared scene keeps the direct subtree path there.
import type { Node2D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createCanvasCacheState,
  createDisplayObject,
  createGlCacheState,
  createRenderCache,
  createShape,
  createWgpuCacheState,
  getBitmapPixelRgb,
  refreshCanvasRenderCache,
  refreshGlRenderCache,
  refreshWgpuRenderCache,
  ShapeKind,
  useRenderCache,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Two rectangles inside one container subtree, laid out in the subtree's local space.
const MAGENTA_X = 200;
const MAGENTA_Y = 180;
const MAGENTA_COLOR = 0xdd22aaff; // 24-bit RGB

const GREEN_X = 440;
const GREEN_Y = 320;
const GREEN_COLOR = 0x33cc44ff; // 24-bit RGB

const RECT_SIZE = 160;

declareAntialiasingPolicy('no-aa');

const target = await createFunctionalTarget({
  contextAttributes: { antialias: false },
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [ShapeKind],
  cache: true,
  expectedImageDescription:
    'An 800x600 opaque black field with exactly two flat, opaque, axis-aligned squares, each 160x160. The ' +
    'first is magenta and spans x 200-360, y 180-340; the second is green and spans x 440-600, y 320-480. ' +
    'They neither touch nor overlap, and the diagonal gap between them near x 400, y 260 is pure black. ' +
    'Both squares are one flat colour edge to edge — no gradient, no softened or feathered border, no ' +
    'blending against the background, and no ghost or doubled copy offset from either one.',
});
const { render, width } = target;

const root = createDisplayObject();

// The subtree to cache: a container with two filled shapes.
const subtree = createDisplayObject();

const magenta = createShape();
appendShapeBeginFill(magenta, MAGENTA_COLOR, 1);
appendShapeRectangle(magenta, MAGENTA_X, MAGENTA_Y, RECT_SIZE, RECT_SIZE);
appendShapeEndFill(magenta);
addNodeChild(subtree, magenta);

const green = createShape();
appendShapeBeginFill(green, GREEN_COLOR, 1);
appendShapeRectangle(green, GREEN_X, GREEN_Y, RECT_SIZE, RECT_SIZE);
appendShapeEndFill(green);
addNodeChild(subtree, green);

addNodeChild(root, subtree);

// Bake the subtree into a cache and opt the subtree's node into it. After this, the screen render pass
// composites the baked target for `subtree` instead of traversing its children. createRenderCache() owns no
// backend resource; refresh*RenderCache(cacheState, cache, source) allocates the target and bakes into it;
// useRenderCache(state, source, cache) attaches the cache so the screen pass composites it.
if (target.kind === 'canvas') {
  const cache = createRenderCache();
  const cacheState = createCanvasCacheState(target.state);
  refreshCanvasRenderCache(cacheState, cache, subtree);
  useRenderCache(target.state, subtree, cache);
} else if (target.kind === 'webgl') {
  const cache = createRenderCache();
  const cacheState = createGlCacheState(target.state, target.state.contextState, target.state.pipeline, {
    allowSmoothing: target.state.allowSmoothing,
    pixelRatio: target.state.pixelRatio,
    roundPixels: target.state.roundPixels,
    sceneGraphSyncPolicy: target.state.sceneGraphSyncPolicy,
  });
  refreshGlRenderCache(target.state, cacheState, cache, subtree);
  useRenderCache(target.state, subtree, cache);
} else if (target.kind === 'webgpu') {
  const cache = createRenderCache();
  const cacheState = createWgpuCacheState(target.state);
  refreshWgpuRenderCache(cacheState, cache, subtree);
  useRenderCache(target.state, subtree, cache);
}

render(root as Node2D);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) The magenta rectangle's center carries its color (cached or direct).
  const mag = at(MAGENTA_X + RECT_SIZE / 2, MAGENTA_Y + RECT_SIZE / 2);
  if (!isMagenta(mag)) {
    throw new Error(`[scene2d-cache] cached magenta rect not magenta — got #${hex(mag)}`);
  }

  // 2) The green rectangle's center carries its color.
  const grn = at(GREEN_X + RECT_SIZE / 2, GREEN_Y + RECT_SIZE / 2);
  if (!isGreen(grn)) {
    throw new Error(`[scene2d-cache] cached green rect not green — got #${hex(grn)}`);
  }

  // 3) A gap between the two rectangles (covered by neither) is background — the cache did not smear or
  // fill the empty region.
  const gap = at(MAGENTA_X + RECT_SIZE + 40, MAGENTA_Y + RECT_SIZE / 2);
  if (!isBackground(gap)) {
    throw new Error(`[scene2d-cache] empty gap not background — got #${hex(gap)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isMagenta(rgb: number): boolean {
  // magenta ~ (221, 34, 170): strong red, low green, strong blue
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 110 && channel(rgb, 0) > 110;
}
function isGreen(rgb: number): boolean {
  // green ~ (51, 204, 68): low red, strong green, low blue
  return channel(rgb, 16) < 110 && channel(rgb, 8) > 150 && channel(rgb, 0) < 120;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
