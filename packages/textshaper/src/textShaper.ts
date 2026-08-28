import type {
  BackendOperationExplanation,
  TextFormat,
  TextShaperBackend,
  TextShaperOperation,
} from '@flighthq/types/contract';

import { _textShaperBackendHook } from './_textShaperHooks';

// Returns the active text-shaper backend, or null when none has been registered. Unlike the
// always-on platform capabilities (clipboard, storage), shaping has no light web default that lives
// here: the canvas backend needs DOM + font-string computation, so it ships in
// @flighthq/textshaper-canvas and is installed via setTextShaperBackend. This mirrors text-layout's
// historical measure-provider, which was null until a renderer registered one — callers fall back to
// leaving text unmeasured until a backend exists. A future @flighthq/textshaper-harfbuzz registers
// the same way.
// Which layer implements `operation`. This capability is a SINGLE NULLABLE SLOT — there is no host layer
// and no sentinel — so the two honest answers are `'custom'` (a backend is installed and provides it) and
// `'none'` (no backend is installed at all). Reporting `'sentinel'` here would name a fall-through object
// that does not exist, and inventing a host layer would describe a precedence this package does not have.
export function explainTextShaperOperation(operation: TextShaperOperation): BackendOperationExplanation {
  if (_backend !== null && typeof _backend[operation] === 'function') {
    return { implemented: true, layer: 'custom', operation };
  }
  return { implemented: false, layer: 'none', operation };
}

export function getTextShaperBackend(): TextShaperBackend | null {
  return _backend;
}

// Whether an installed backend implements `operation`. False when nothing is installed, which for this
// capability is also what the getter reports by returning null.
export function hasTextShaperOperation(operation: TextShaperOperation): boolean {
  return explainTextShaperOperation(operation).implemented;
}

// Measures `text` in `format` to its horizontal advance, in pixels, via the active backend. Returns
// the sentinel -1 when no backend is registered (expected before setup), so callers can distinguish
// "unmeasurable" from a real zero-width advance.
export function measureText(text: string, format: Readonly<TextFormat>): number {
  if (_backend === null) return -1;
  return _backend.measureText(text, format);
}

// Installs a text-shaper backend; pass null to clear it. Last write wins — registering over an
// existing backend replaces it, which is how a host swaps the canvas default for HarfBuzz. Never
// throws on re-registration.
export function setTextShaperBackend(backend: TextShaperBackend | null): void {
  _backend = backend;
  _textShaperBackendHook?.(backend);
}

let _backend: TextShaperBackend | null = null;
