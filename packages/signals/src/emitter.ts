/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

import { disconnectSignal } from './slot.js';

export function cancelSignal<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  signal.canceled = true;
}

export function emitSignal<T extends (...args: any[]) => void>(signal: Signal<T>, ...args: Parameters<T>): void {
  signal.canceled = false;
  let node = signal.head;
  while (node !== null) {
    const next = node.next;
    (node.callback as (...a: any[]) => void)(...args);
    if (node.once) disconnectSignal(signal, node.callback);
    if (signal.canceled) break;
    node = next;
  }
}
