import type { TextShaperBackend, TextShaperSignals } from '@flighthq/types';

import { _setTextShaperBackendHook } from './_textShaperHooks';

// Disposes the text-shaper signal group, removing all listeners and clearing the backend hook.
// The entity returned by `enableTextShaperSignals` must not be used after this call. Clearing is
// idempotent: calling dispose when not enabled is a no-op.
export function disposeTextShaperSignals(): void {
  if (_signals === null) return;
  _signals._listeners.length = 0;
  _signals = null;
  _setTextShaperBackendHook(null);
}

// Activates the text-shaper signal group and returns the TextShaperSignals entity. The cost of
// listener registration and dispatch is assumed on the first call to this function; callers that
// never call it pay nothing.
//
// Subsequent calls return the same TextShaperSignals entity; `enableTextShaperSignals` is
// idempotent. The returned entity is live for the lifetime of the application unless
// `disposeTextShaperSignals` is called. All calls to `setTextShaperBackend` (base or via this
// module) automatically emit onBackendChanged — callers do not need a separate patched setter.
export function enableTextShaperSignals(): TextShaperSignals {
  if (_signals !== null) return _signals;
  const listeners: ((backend: TextShaperBackend | null) => void)[] = [];
  const sigImpl: TextShaperSignalsImpl = {
    _listeners: listeners,
    onBackendChanged: {
      data: null,
      emit: (backend: TextShaperBackend | null) => {
        for (let i = 0; i < listeners.length; i++) {
          listeners[i](backend);
        }
      },
    },
  };
  _signals = sigImpl;
  // Install the hook so setTextShaperBackend in textShaper.ts calls onBackendChanged.emit after
  // every backend change, with no circular import and no separate patched setter.
  _setTextShaperBackendHook((backend) => {
    if (_signals !== null) {
      _signals.onBackendChanged.emit(backend);
    }
  });
  return sigImpl;
}

// Returns the active TextShaperSignals entity, or null when signals have not been enabled.
export function getTextShaperSignals(): TextShaperSignals | null {
  return _signals;
}

// The package-private signals shape: the public TextShaperSignals plus the internal listener list
// the emit closure dispatches over. The list is not part of the public API.
interface TextShaperSignalsImpl extends TextShaperSignals {
  _listeners: ((backend: TextShaperBackend | null) => void)[];
}

// The lazily-initialized signals entity. Null until `enableTextShaperSignals` is called; the
// cost of listener dispatch is zero until the group is activated.
let _signals: TextShaperSignalsImpl | null = null;
