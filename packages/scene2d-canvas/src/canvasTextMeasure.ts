import { computeTextFormatFontString } from '@flighthq/text/contract';
import type {
  CanvasRenderSurface,
  NonEntityCreateResult,
  TextFormat,
  TextMeasureFunction,
} from '@flighthq/types/contract';

// Builds a TextMeasureFunction backed by a private offscreen 2D canvas — the measurement battery for
// setTextLayoutMeasureProvider. Register it once during setup
// (setTextLayoutMeasureProvider(createCanvasTextMeasure())) so ensureRichTextLayout can measure text
// for metrics and autoSize bounds outside the render pass. Same canvas measureText the renderers use,
// so the ensured layout matches what gets rasterized.
export function createCanvasTextMeasure(
  surface: Readonly<CanvasRenderSurface>,
): NonEntityCreateResult<TextMeasureFunction, 'type-only'> {
  const context = surface.context;
  return (text: string, format: TextFormat): number => {
    context.font = computeTextFormatFontString(format);
    return context.measureText(text).width;
  };
}
