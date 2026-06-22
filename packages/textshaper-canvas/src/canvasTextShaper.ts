import { computeTextFormatFontString } from '@flighthq/render';
import type { TextFormat, TextShaperBackend } from '@flighthq/types';

// Builds the canvas-backed text-shaper backend: advances-only shaping over a private offscreen 2D
// canvas's measureText. Install it once during setup via setTextShaperBackend(createCanvasTextShaper-
// Backend()) so text-layout can measure text for metrics and autoSize bounds outside the render pass.
// Uses the same canvas measureText and font string (computeTextFormatFontString) the renderers use, so
// the shaped advances match what gets rasterized. This is the extraction of the former
// createCanvasTextMeasure — the SDK's existing measurement, formalized as a TextShaperBackend.
export function createCanvasTextShaperBackend(): TextShaperBackend {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  return {
    measureText(text: string, format: TextFormat): number {
      context.font = computeTextFormatFontString(format);
      return context.measureText(text).width;
    },
  };
}
