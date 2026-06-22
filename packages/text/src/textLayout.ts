import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getNodeLocalContentRevision } from '@flighthq/node';
import {
  computeTextLayout,
  getTextLayoutMeasureProvider,
  getTextLayoutResult,
  getTextMetrics,
} from '@flighthq/text-layout';
import type { TextLabel, TextLabelRuntime, TextLayoutResult, TextMetrics } from '@flighthq/types';

// Lazily refreshes the cached text layout for `source` — TextLabel or RichText alike —
// mirroring the node graph's ensure* pattern (e.g. ensureNodeLocalBoundsRectangle). If the
// local-content revision changed since the layout was last computed, it asks the node's kind to
// assemble its layout params (the single per-kind difference) via runtime.buildTextLayoutParams,
// recomputes, and restamps. Cheap and idempotent when already current. Callable from anywhere needing
// text metrics, bounds, or rendering — no render pass required, which is what lets text be measured
// before (or without) it is ever drawn. If no measure provider is registered yet, the layout is left
// as-is (null or stale) until setTextLayoutMeasureProvider is called, after which the next ensure
// refreshes it.
export function ensureTextLayout(source: Readonly<TextLabel>): void {
  const runtime = getDisplayObjectRuntime(source) as TextLabelRuntime;
  const contentId = getNodeLocalContentRevision(source);
  if (runtime.textLayout !== null && runtime.textLayoutUsingContentId === contentId) return;

  const measure = getTextLayoutMeasureProvider();
  if (measure === null) return;

  const params = runtime.buildTextLayoutParams(source, measure);
  const result = getTextLayoutResult(runtime);
  computeTextLayout(result, params);
  runtime.textLayoutUsingContentId = contentId;
}

// Ensures the layout is current and returns it, or null if no measure provider has been registered
// yet (so a caller can distinguish "no text" from "not yet measurable").
export function getTextLayout(source: Readonly<TextLabel>): TextLayoutResult | null {
  ensureTextLayout(source);
  return (getDisplayObjectRuntime(source) as TextLabelRuntime).textLayout;
}

// Ensures the layout is current and fills `out` with the measured content size (Flash
// textWidth/textHeight). Zeroes `out` when no layout is available (no measure provider registered).
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
