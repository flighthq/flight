import type {
  BackendOperationExplanation,
  HasTextShaper,
  TextFormat,
  TextShaperBackend,
  TextShaperOperation,
} from '@flighthq/types/contract';

import { _textShaperBackendHook } from './_textShaperHooks';

// Which layer implements `operation`. An explicit host provider wins over the legacy installed
// backend. There is no sentinel because this package has no light bundled shaper implementation.
export function explainTextShaperOperation(
  operation: TextShaperOperation,
  host?: HasTextShaper,
): BackendOperationExplanation {
  const backend = getTextShaperBackend(host);
  if (backend !== null && typeof backend[operation] === 'function') {
    return { implemented: true, layer: host === undefined ? 'custom' : 'host', operation };
  }
  return { implemented: false, layer: 'none', operation };
}

// Returns the explicit host's shaper when supplied, otherwise the legacy installed backend. Unlike
// text segmentation, shaping has no light bundled default: the canvas provider needs DOM and font
// string computation, so callers must compose it into a host or install it through the legacy path.
export function getTextShaperBackend(host?: HasTextShaper): TextShaperBackend | null {
  return host?.text.shaper ?? _backend;
}

// Whether the selected backend implements `operation`. False when neither an explicit nor legacy
// provider supplies it.
export function hasTextShaperOperation(operation: TextShaperOperation, host?: HasTextShaper): boolean {
  return explainTextShaperOperation(operation, host).implemented;
}

// Measures `text` in `format` to its horizontal advance, in pixels, via the explicit host or legacy
// fallback. Returns the sentinel -1 when neither is available, distinguishing "unmeasurable" from a
// real zero-width advance.
export function measureText(text: string, format: Readonly<TextFormat>, host?: HasTextShaper): number {
  const backend = getTextShaperBackend(host);
  if (backend === null) return -1;
  return backend.measureText(text, format);
}

/**
 * Installs the backend used by calls that omit an explicit host; pass null to clear it. Last write
 * wins and re-registration never throws.
 *
 * @deprecated Pass a HasTextShaper to the text-shaping operation. Retained for source compatibility
 * until the legacy global path is removed.
 */
export function setTextShaperBackend(backend: TextShaperBackend | null): void {
  _backend = backend;
  _textShaperBackendHook?.(backend);
}

let _backend: TextShaperBackend | null = null;
