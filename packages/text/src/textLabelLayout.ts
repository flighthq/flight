import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import { computeTextLayout, getTextLayoutMeasureProvider, getTextMetrics } from '@flighthq/textlayout/contract';
import type { TextLayoutResult, TextMetrics } from '@flighthq/textlayout/contract';

import { getTextLayoutResult } from './textLayoutRuntime.ts';
import type { TextLabel, TextLabelRuntime } from './types.ts';

export function ensureTextLayout(source: Readonly<NodeRef>): void {
  const textLabel = source as TextLabel;
  const runtime = getNode2DRuntime(textLabel) as TextLabelRuntime;
  const contentId = getNodeLocalContentRevision(textLabel);
  if (runtime.textLayout !== null && runtime.textLayoutUsingContentId === contentId) {
    if (
      _textLabelGuard !== null &&
      runtime.textLayoutUsingText !== null &&
      textLabel.data.text !== runtime.textLayoutUsingText
    ) {
      _textLabelGuard(textLabel.data.text, runtime.textLayoutUsingText);
    }
    return;
  }

  const measure = getTextLayoutMeasureProvider();
  if (measure === null) return;

  const params = runtime.buildTextLayoutParams(textLabel, measure);
  const result = getTextLayoutResult(runtime);
  computeTextLayout(result, params);
  runtime.textLayoutUsingContentId = contentId;
  runtime.textLayoutUsingText = textLabel.data.text;
}

export function getTextLayout(source: Readonly<NodeRef>): TextLayoutResult | null {
  ensureTextLayout(source);
  return (getNode2DRuntime(source as TextLabel) as TextLabelRuntime).textLayout;
}

export function getTextLayoutMetrics(out: TextMetrics, source: Readonly<NodeRef>): void {
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

export function setTextLayoutResult(source: Readonly<NodeRef>, layout: TextLayoutResult): void {
  const textLabel = source as TextLabel;
  const runtime = getNode2DRuntime(textLabel) as TextLabelRuntime;
  runtime.textLayout = layout;
  runtime.textLayoutUsingContentId = getNodeLocalContentRevision(textLabel);
  runtime.textLayoutUsingText = textLabel.data.text;
}

let _textLabelGuard: ((liveString: string, rasterizedString: string) => void) | null = null;
