import type { TextFormat, TextShaperBackend } from '@flighthq/types';

import { _textShaperBackendHook } from './_textShaperHooks';

// Returns the active text-shaper backend, or null when none has been registered. Unlike the
// always-on platform capabilities (clipboard, storage), shaping has no light web default that lives
// here: the canvas backend needs DOM + font-string computation, so it ships in
// @flighthq/textshaper-canvas and is installed via setTextShaperBackend. This mirrors text-layout's
// historical measure-provider, which was null until a renderer registered one — callers fall back to
// leaving text unmeasured until a backend exists. A future @flighthq/textshaper-harfbuzz registers
// the same way.
export function getTextShaperBackend(): TextShaperBackend | null {
  return _backend;
}

// Installs a text-shaper backend; pass null to clear it. Last write wins — registering over an
// existing backend replaces it, which is how a host swaps the canvas default for HarfBuzz. Never
// throws on re-registration.
export function setTextShaperBackend(backend: TextShaperBackend | null): void {
  _backend = backend;
  _textShaperBackendHook?.(backend);
}

// Shapes `text` in `format` to its horizontal advance, in pixels, via the active backend. Advances
// are all current shaping produces (canvas measureText); this is the single value text-layout needs
// to place each character. Returns the sentinel -1 when no backend is registered (expected before
// setup), so callers can distinguish "unmeasurable" from a real zero-width advance.
export function shapeText(text: string, format: Readonly<TextFormat>): number {
  if (_backend === null) return -1;
  return _backend.measureText(text, format);
}

let _backend: TextShaperBackend | null = null;
