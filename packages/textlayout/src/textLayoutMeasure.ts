import { measureText } from '@flighthq/textshaper/contract';
import type { HostTextShaperProvider, TextMeasureFunction } from '@flighthq/types/contract';

// Resolves the text-measurement provider text-layout uses to turn characters into advances. When a
// HostTextShaperProvider is supplied, it returns a bound measure function that delegates to
// measureText. An explicitly set provider (setTextLayoutMeasureProvider) still takes precedence — it
// is the direct-injection escape hatch for tests and bespoke hosts. Null when neither exists,
// exactly as before, so ensureRichTextLayout leaves the layout stale until shaping is available.
export function getTextLayoutMeasureProvider(
  hostTextShaper?: Readonly<HostTextShaperProvider>,
): TextMeasureFunction | null {
  if (_measureProvider !== null) return _measureProvider;
  if (hostTextShaper !== undefined) return (text, format) => measureText(hostTextShaper, text, format);
  return null;
}

// Installs an explicit measure provider, bypassing the shaper seam. Pass null to clear it and fall
// back to the host text shaper. Prefer passing a HostTextShaperProvider to
// getTextLayoutMeasureProvider for normal setup; this remains for direct injection (tests, a host
// wiring its own measure without a full HostTextShaperProvider).
export function setTextLayoutMeasureProvider(measure: TextMeasureFunction | null): void {
  _measureProvider = measure;
}

let _measureProvider: TextMeasureFunction | null = null;
