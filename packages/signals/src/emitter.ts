// Generated from crates/flight-signals/src/emitter.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { compactSignalData } from './slot.ts';
import type { SignalData, SignalRaw, SignalSlot } from './types.ts';

export function cancelSignal<T>(signal: SignalRaw<T>): void {
  let state = signal.data!;
  if (state !== undefined) {
    const signalData = state;
    signalData.cancelled = true;
  }
}

/**
 * Emits the signal in priority order. The data lock is held only to read or update one entry at
 * a time, never across a callback, so a slot may re-entrantly connect, disconnect, emit or
 * cancel (D4). Slots added ahead of the cursor during the walk are reached, as in TS.
 */
export function dispatchSignalData<T>(signal: SignalRaw<T>, args: T): boolean {
  if (!beginSignalDispatch(signal.data)) {
    return false;
  }
  let index = 0;
  while (signalDispatchHasIndex(signal.data, index)) {
    const slot = getSignalDispatchSlot(signal.data, index);
    if (slot !== undefined) {
      const callback = slot;
      callback(args);
      const cancelled = signalDataCancelled(signal.data);
      if (cancelled) {
        break;
      }
      let state = signal.data!;
      if (state !== undefined) {
        const signalData = state;
        if (index < signalData.slots.length && !signalData.repeat[index]) {
          signalData.slots[index] = undefined;
        }
      }
    }
    index += 1;
  }
  if (endSignalDispatch(signal.data)) {
    return compactSignalData(signal.data);
  }
  return false;
}

/**
 * Calls the source-required emitter, including custom callbacks and spread wrappers.
 */
export function emitSignal<T>(signal: SignalRaw<T>, args: T): void {
  const emit = signal.emit!;
  emit(args);
}

function beginSignalDispatch<T>(data: SignalData<T> | undefined): boolean {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  signalData.cancelled = false;
  signalData.depth += 1;
  return true;
}

function endSignalDispatch<T>(data: SignalData<T> | undefined): boolean {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  signalData.depth -= 1;
  return signalData.depth === 0;
}

function signalDispatchHasIndex<T>(data: SignalData<T> | undefined, index: number): boolean {
  const state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  return index < signalData.slots.length;
}

function getSignalDispatchSlot<T>(data: SignalData<T> | undefined, index: number): SignalSlot<T> | undefined {
  const state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return undefined;
  }
  if (index >= signalData.slots.length || signalData.paused[index]) {
    return undefined;
  }
  return signalData.slots[index];
}

export function signalDataCancelled<T>(data: SignalData<T> | undefined): boolean {
  const state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  return signalData.cancelled;
}
