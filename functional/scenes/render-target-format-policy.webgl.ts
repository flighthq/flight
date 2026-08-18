import { getBitmapPixelRgb } from '@flighthq/bitmap';
import {
  beginGlRenderPass,
  createGlCanvasElement,
  createGlRenderState,
  createGlRenderTarget,
  endGlRenderPass,
  explainGlRenderTarget,
  isGlRenderTargetFormatSupported,
  presentGlRenderTarget,
} from '@flighthq/render-gl/contract';
import type { Bitmap } from '@flighthq/types';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'The entire 320×240 field is a single opaque green, approximately R33 G196 B90. The colour is ' +
    'uniform at the centre, edges and corners. There is no black or transparent area, ' +
    'incomplete-frame stripe, geometry, border or second colour.',
);

export const width = 320;
export const height = 240;
export const scale = window.devicePixelRatio || 1;
// The scene assertion intentionally uses a full-canvas solid color. Its behavior check is the negotiated
// storage and sentinel path below; assertRender verifies that whichever path the device supports
// produced a usable target rather than a blank/incomplete framebuffer.
export const minCoverage = 0;

const canvas = createGlCanvasElement(width, height, scale);
document.body.appendChild(canvas);
const state = createGlRenderState(canvas, {
  antialias: false,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  // RGBA32F renderability and linear filtering are distinct GL capabilities. This scene negotiates
  // color-renderable storage only, so sample with the universally valid nearest filter.
  imageSmoothingEnabled: false,
  pixelRatio: scale,
});
const descriptor = {
  clearColors: [0x21c45aff],
  colorSpace: 'srgb' as const,
  format: 'rgba32f' as const,
  height: canvas.height,
  width: canvas.width,
};

const floatSupported = isGlRenderTargetFormatSupported(state, 'rgba32f');
const requiredTarget = createGlRenderTarget(state, descriptor, 'required');
if ((requiredTarget !== null) !== floatSupported) {
  throw new Error('[render-target-format-policy] capability query and required allocation disagreed');
}

const target = requiredTarget ?? createGlRenderTarget(state, descriptor, 'preferred');
const explanation = explainGlRenderTarget(target);
if (floatSupported) {
  if (target.format !== 'rgba32f' || target.colorFormats[0] !== 'rgba32f' || explanation.differences.length !== 0) {
    throw new Error('[render-target-format-policy] supported rgba32f storage was substituted');
  }
} else {
  const formatDifference = explanation.differences.find((difference) => difference.axis === 'format');
  const colorFormatsDifference = explanation.differences.find((difference) => difference.axis === 'colorFormats');
  if (
    target.format !== 'rgba8' ||
    target.colorFormats[0] !== 'rgba8' ||
    formatDifference?.requested !== 'rgba32f' ||
    formatDifference.effective !== 'rgba8' ||
    !Array.isArray(colorFormatsDifference?.requested) ||
    colorFormatsDifference.requested[0] !== 'rgba32f' ||
    !Array.isArray(colorFormatsDifference.effective) ||
    colorFormatsDifference.effective[0] !== 'rgba8'
  ) {
    throw new Error('[render-target-format-policy] preferred fallback lost its requested/effective explanation');
  }
}

beginGlRenderPass(state, target);
endGlRenderPass(state);
presentGlRenderTarget(state, target);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(bitmap, bitmap.width >> 1, bitmap.height >> 1);
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;
  if (green < 150 || green < red * 2 || green < blue * 2) {
    throw new Error(
      `[render-target-format-policy] expected negotiated target to be green, got #${(rgb & 0xffffff)
        .toString(16)
        .padStart(6, '0')}`,
    );
  }
}
