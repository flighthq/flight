import { createAppWindow, openWindow } from '@flighthq/app';
import { getBitmapPixelRgb } from '@flighthq/bitmap';
import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceCanvas,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import {
  acquireGlTextureRenderTarget,
  beginGlRenderPass,
  createGlRenderState,
  createGlTextureRenderTargetPool,
  endGlRenderPass,
  explainGlTextureRenderTarget,
  presentGlRenderTarget,
  releaseGlTextureRenderTarget,
  resizeGlTextureRenderTarget,
} from '@flighthq/render-gl/contract';
import { glScene3DRenderPreset } from '@flighthq/scene3d-gl/contract';
import { createGlSurface, setSurfaceDisplaySize } from '@flighthq/surface/contract';
import type { Bitmap } from '@flighthq/types';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'The entire 320×240 field is a single opaque green, approximately R33 G196 B90. It is uniform at ' +
    'the centre, edges and corners. Red is nowhere visible, and there is no black area, resize seam, ' +
    'split panel, geometry or border.',
);

export const width = 320;
export const height = 240;
export const scale = window.devicePixelRatio || 1;
// This scene assertion intentionally uses a full-canvas solid color. The generic foreground/background
// heuristic has no split to measure, so assertRender below checks the actual attachment color.
export const minCoverage = 0;

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, width * scale, height * scale, {
  antialias: false,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, width, height);
appendWebSurface(glSurface, document.body);
const canvas = getWebSurfaceCanvas(glSurface)!;

const state = createGlRenderState(glSurface.context, { ...glScene3DRenderPreset, pixelRatio: scale });
const pool = createGlTextureRenderTargetPool();
const initialWidth = canvas.width >> 1;
const initialHeight = canvas.height >> 1;

// Park a physically incompatible target whose legacy pool key nevertheless matched only this
// request's dimensions, primary format, and sample count.
const singleAttachment = acquireGlTextureRenderTarget(state, pool, {
  colorSpace: 'srgb',
  depth: 'none',
  height: initialHeight,
  width: initialWidth,
});
releaseGlTextureRenderTarget(pool, singleAttachment);

const target = acquireGlTextureRenderTarget(state, pool, {
  colorAttachments: 2,
  colorFormats: ['rgba8', 'rgba16f'],
  colorSpace: 'srgb',
  depth: 'depth-stencil-sampled',
  height: initialHeight,
  width: initialWidth,
});
if (target === singleAttachment) {
  throw new Error('[render-target-axes] the pool reused an incompatible single-attachment target');
}

const explanation = explainGlTextureRenderTarget(target);
if (
  explanation.requested.colorAttachments !== 2 ||
  explanation.requested.colorFormats[1] !== 'rgba16f' ||
  explanation.effective.colorAttachments !== target.colorAttachments ||
  explanation.effective.colorFormats[1] !== target.colorFormats[1]
) {
  throw new Error('[render-target-axes] requested/effective axes did not describe the allocated MRT');
}

const formatsBeforeResize = [...target.colorFormats];
const depthTextureBeforeResize = target.depthTexture;
resizeGlTextureRenderTarget(state, target, canvas.width, canvas.height);
if (
  target.colorAttachments !== 2 ||
  target.colorFormats.length !== formatsBeforeResize.length ||
  !target.colorFormats.every((format, index) => format === formatsBeforeResize[index]) ||
  !target.textures[1] ||
  !target.depthTexture ||
  target.depthTexture === depthTextureBeforeResize
) {
  throw new Error('[render-target-axes] heterogeneous MRT or sampled depth storage was lost during resize');
}

const pass = beginGlRenderPass(state, target, {
  colors: [
    [217 / 255, 39 / 255, 39 / 255, 1],
    [33 / 255, 196 / 255, 90 / 255, 1],
  ],
  depth: 1.0,
  stencil: 0,
});
endGlRenderPass(pass);

// Present attachment 1, not the primary attachment. Its green clear proves that the heterogeneous
// second attachment remained independently addressable after resize.
presentGlRenderTarget(state, { ...target, texture: target.textures[1] });

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(bitmap, bitmap.width >> 1, bitmap.height >> 1);
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;
  if (green < 150 || green < red * 2 || green < blue * 2) {
    throw new Error(
      `[render-target-axes] expected resized attachment 1 to be green, got #${(rgb & 0xffffff)
        .toString(16)
        .padStart(6, '0')}`,
    );
  }
}
