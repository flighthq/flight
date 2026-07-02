import { getTextShaperBackend, measureText } from '@flighthq/textshaper';
import type { TextMeasureFunction } from '@flighthq/types';

// Resolves the text-measurement provider text-layout uses to turn characters into advances. Shaping
// is now owned by the @flighthq/textshaper seam: when a shaper backend is registered (the canvas
// backend from @flighthq/textshaper-canvas, or a future HarfBuzz one), this returns measureText,
// which is itself a TextMeasureFunction. An explicitly set provider (setTextLayoutMeasureProvider) still
// takes precedence — it is the direct-injection escape hatch for tests and bespoke hosts. Null when
// neither exists, exactly as before, so ensureRichTextLayout leaves the layout stale until shaping is
// available.
export function getTextLayoutMeasureProvider(): TextMeasureFunction | null {
  if (_measureProvider !== null) return _measureProvider;
  if (getTextShaperBackend() !== null) return measureText;
  return null;
}

// Installs an explicit measure provider, bypassing the shaper seam. Pass null to clear it and fall
// back to the registered shaper backend. Prefer setTextShaperBackend for normal setup; this remains
// for direct injection (tests, a host wiring its own measure without a full TextShaperBackend).
export function setTextLayoutMeasureProvider(measure: TextMeasureFunction | null): void {
  _measureProvider = measure;
}

let _measureProvider: TextMeasureFunction | null = null;
