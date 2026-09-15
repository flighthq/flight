import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal } from '@flighthq/signals/contract';
import type { EntityConstruction, HostTextShaperProvider, TextShaperSignals } from '@flighthq/types/contract';

export function disposeTextShaperSignals(): void {
  if (_signals === null) return;
  clearSignal(_signals.onBackendChanged);
  _signals = null;
}

export function enableTextShaperSignals(): TextShaperSignals {
  if (_signals !== null) return _signals;
  _signals = (() => {
    const out = allocateEntity<TextShaperSignals>();
    initializeTextShaperSignals(out);
    return finishEntity(out);
  })();
  return _signals;
}

export function getTextShaperSignals(): TextShaperSignals | null {
  return _signals;
}

export function initializeTextShaperSignals(out: EntityConstruction<TextShaperSignals>): void {
  out.onBackendChanged = createSignal<(backend: HostTextShaperProvider | null) => void>();
}

let _signals: TextShaperSignals | null = null;
