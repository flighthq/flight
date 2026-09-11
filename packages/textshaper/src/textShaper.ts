import type {
  BackendOperationExplanation,
  HostTextShaperProvider,
  TextFormat,
  TextShaperOperation,
} from '@flighthq/types/contract';

import { _textShaperBackendHook } from './_textShaperHooks';

// Which layer implements `operation`. An explicit host provider wins over the legacy installed
// backend. There is no sentinel because this package has no light bundled shaper implementation.
export function explainTextShaperOperation(
  operation: TextShaperOperation,
  hostTextShaper?: Readonly<HostTextShaperProvider>,
): BackendOperationExplanation {
  const backend = getTextShaperBackend(hostTextShaper);
  if (backend !== null && typeof backend[operation] === 'function') {
    return { implemented: true, layer: hostTextShaper === undefined ? 'custom' : 'host', operation };
  }
  return { implemented: false, layer: 'none', operation };
}

// Returns the explicit host's shaper when supplied, otherwise the legacy installed backend. Unlike
// text segmentation, shaping has no light bundled default: the canvas provider needs DOM and font
// string computation, so callers must compose it into a host or install it through the legacy path.
export function getTextShaperBackend(hostTextShaper?: Readonly<HostTextShaperProvider>): HostTextShaperProvider | null {
  return hostTextShaper ?? _backend;
}

// Whether the selected backend implements `operation`. False when neither an explicit nor legacy
// provider supplies it.
export function hasTextShaperOperation(
  operation: TextShaperOperation,
  hostTextShaper?: Readonly<HostTextShaperProvider>,
): boolean {
  return explainTextShaperOperation(operation, hostTextShaper).implemented;
}

// Measures `text` in `format` to its horizontal advance, in pixels, via the explicit host or legacy
// fallback. Returns the sentinel -1 when neither is available, distinguishing "unmeasurable" from a
// real zero-width advance.
export function measureText(
  text: string,
  format: Readonly<TextFormat>,
  hostTextShaper?: Readonly<HostTextShaperProvider>,
): number {
  const backend = getTextShaperBackend(hostTextShaper);
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
export function setTextShaperBackend(backend: HostTextShaperProvider | null): void {
  _backend = backend;
  _textShaperBackendHook?.(backend);
}

let _backend: HostTextShaperProvider | null = null;
