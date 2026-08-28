import { getBitmapPixelRgb } from '@flighthq/bitmap';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createRenderCache } from '@flighthq/render';
import {
  beginGlRenderPass,
  createGlCanvasElement,
  createGlRenderState,
  createGlRenderTarget,
  endGlRenderPass,
  presentGlRenderTarget,
} from '@flighthq/render-gl/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { createGlCacheState, refreshGlRenderCache } from '@flighthq/scene2d-gl';
import type { Bitmap } from '@flighthq/types';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'The entire 320×240 field is a single opaque bright red, approximately R230 G20 B20. It is ' +
    'uniform from edge to edge, including the centre and all four corners: no green control colour, ' +
    'black clear, rectangle, border or second region remains visible.',
);

export const width = 320;
export const height = 240;
export const scale = window.devicePixelRatio || 1;
// This scene assertion intentionally uses a full-canvas solid color (red vs. the green control) -- there is no
// foreground/background split for the generic blank-render coverage heuristic to measure against,
// so it always reads 0. assertRender below is the real check.
export const minCoverage = 0;

enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(width, height, scale);
document.body.appendChild(canvas);
const state = createGlRenderState(canvas, {
  antialias: false,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio: scale,
});
const screenTarget = createGlRenderTarget(state, {
  clearColors: [0x18b33aff],
  height: canvas.height,
  width: canvas.width,
});
const cacheState = createGlCacheState(state);

beginGlRenderPass(state, screenTarget);
refreshGlRenderCache(cacheState, createRenderCache(), createDisplayObject());

// The cache state is a distinct GlRenderState over the same physical context. Its nested pass must
// restore this outer framebuffer before the screen render continues. Green is the untouched target
// control; red proves this clear landed back on screenTarget instead of leaking to the default canvas.
state.gl.clearColor(0.9, 0.08, 0.08, 1);
state.gl.clear(state.gl.COLOR_BUFFER_BIT);
endGlRenderPass(state);
presentGlRenderTarget(state, screenTarget);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(bitmap, bitmap.width >> 1, bitmap.height >> 1);
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  if (red < 160 || green > 80) {
    throw new Error(
      `[render-pass-shared-context] expected the restored outer target to be red, got #${(rgb & 0xffffff)
        .toString(16)
        .padStart(6, '0')}`,
    );
  }
}
