import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import {
  computeTextLayout,
  getTextLayoutMeasureProvider,
  getTextLayoutResult,
  getTextMetrics,
} from '@flighthq/textlayout/contract';
import type { TextLabel, TextLabelRuntime, TextLayoutResult, TextMetrics } from '@flighthq/types/contract';

export function ensureTextLayout(source: Readonly<TextLabel>): void {
  const runtime = getNode2DRuntime(source) as TextLabelRuntime;
  const contentId = getNodeLocalContentRevision(source);
  if (runtime.textLayout !== null && runtime.textLayoutUsingContentId === contentId) {
    if (
      _textLabelGuard !== null &&
      runtime.textLayoutUsingText !== null &&
      source.data.text !== runtime.textLayoutUsingText
    ) {
      _textLabelGuard(source.data.text, runtime.textLayoutUsingText);
    }
    return;
  }

  const measure = getTextLayoutMeasureProvider();
  if (measure === null) return;

  const params = runtime.buildTextLayoutParams(source, measure);
  const result = getTextLayoutResult(runtime);
  computeTextLayout(result, params);
  runtime.textLayoutUsingContentId = contentId;
  runtime.textLayoutUsingText = source.data.text;
}

export function getTextLayout(source: Readonly<TextLabel>): TextLayoutResult | null {
  ensureTextLayout(source);
  return (getNode2DRuntime(source) as TextLabelRuntime).textLayout;
}

export function getTextLayoutMetrics(out: TextMetrics, source: Readonly<TextLabel>): void {
  const layout = getTextLayout(source);
  if (layout === null) {
    out.height = 0;
    out.numLines = 0;
    out.width = 0;
    return;
  }
  getTextMetrics(out, layout);
}

export function setTextLabelGuard(guard: ((liveString: string, rasterizedString: string) => void) | null): void {
  _textLabelGuard = guard;
}

let _textLabelGuard: ((liveString: string, rasterizedString: string) => void) | null = null;
