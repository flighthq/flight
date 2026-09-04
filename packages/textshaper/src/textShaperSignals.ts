import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal } from '@flighthq/signals/contract';
import type { TextShaperBackend, TextShaperSignals } from '@flighthq/types/contract';

import { _setTextShaperBackendHook } from './_textShaperHooks';

export function disposeTextShaperSignals(): void {
  if (_signals === null) return;
  clearSignal(_signals.onBackendChanged);
  _signals = null;
  _setTextShaperBackendHook(null);
}

export function enableTextShaperSignals(): TextShaperSignals {
  if (_signals !== null) return _signals;
  _signals = (() => {
    const out = allocateEntity<TextShaperSignals>();
    out.onBackendChanged = createSignal<(backend: TextShaperBackend | null) => void>();
    return finishEntity(out);
  })();
  _setTextShaperBackendHook((backend) => {
    if (_signals !== null) {
      _signals.onBackendChanged.emit(backend);
    }
  });
  return _signals;
}

export function getTextShaperSignals(): TextShaperSignals | null {
  return _signals;
}

let _signals: TextShaperSignals | null = null;
