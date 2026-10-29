// Generated from crates/flight-signals/src/signal.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import { dispatchSignalData } from './emitter.ts';
import type { SignalRaw } from './types.ts';

export function createSignal<T>(): SignalRaw<T> {
  let out: SignalRaw<T> = allocateEntity<SignalRaw<T>>();
  out.emit = (_unused0: T) => {};
  out.data = undefined;
  initializeSignal(out);
  return out;
}

export function initializeSignal<T>(out: SignalRaw<T>): void {
  out.data = undefined;
  installDefaultSignalEmitter(out);
}

/**
 * Restores native D4 dispatch without holding an emitter-cell lock during callbacks.
 */
export function installDefaultSignalEmitter<T>(signal: SignalRaw<T>): void {
  const dispatchSignal = Object.defineProperties(
    { ...signal },
    {
      data: {
        get: () => signal.data,
        set: (value) => {
          signal.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  signal.emit = (args) => {
    if (dispatchSignalData(dispatchSignal, args)) {
      dispatchSignal.data = undefined;
      signal.emit = (_unused0) => {};
    }
  };
}
