/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

export function cancelSignal<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  if (signal.data !== null) signal.data.cancelled = true;
}

export function emitSignal<T extends (...args: any[]) => void>(signal: Signal<T>, ...args: Parameters<T>): void {
  (signal.emit as (...a: any[]) => void)(...args);
}
