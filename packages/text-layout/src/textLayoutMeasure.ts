import type { TextMeasureFunction } from '@flighthq/types';

// The text-measurement provider, registered once by the platform/render layer (typically a canvas
// measureText). This is the single injection seam that keeps text-layout and displayobject DOM-free:
// measurement is injected, not hard-coded, so the same ensure path serves metrics queries, bounds,
// and the renderer — and a future native C/C++ port registers its own measure. Null until a provider
// is set; consumers (ensureRichTextLayout) fall back to leaving the layout stale until one exists.
//
// Set explicitly via setTextLayoutMeasureProvider (an opt-in, like registerRenderer) — never at module
// init, so importing this package stays side-effect-free.
let _measureProvider: TextMeasureFunction | null = null;

export function getTextLayoutMeasureProvider(): TextMeasureFunction | null {
  return _measureProvider;
}

export function setTextLayoutMeasureProvider(measure: TextMeasureFunction | null): void {
  _measureProvider = measure;
}
