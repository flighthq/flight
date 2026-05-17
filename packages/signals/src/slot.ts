/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal, SignalConnectOptions, Slot } from '@flighthq/types';

export type { SignalConnectOptions, Slot } from '@flighthq/types';

export function connectSignal<T extends (...args: any[]) => void>(
  signal: Signal<T>,
  slot: T,
  options?: SignalConnectOptions,
): void {
  const priority = options?.priority ?? 0;
  const node: Slot<T> = { callback: slot, next: null, once: options?.once ?? false, priority };

  if (signal.head === null || priority > signal.head.priority) {
    node.next = signal.head;
    signal.head = node;
    return;
  }

  let current = signal.head;
  while (current.next !== null && priority <= current.next.priority) {
    current = current.next;
  }
  node.next = current.next;
  current.next = node;
}

export function disconnectAllSignals<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  signal.head = null;
}

export function disconnectSignal<T extends (...args: any[]) => void>(signal: Signal<T>, slot: T): void {
  while (signal.head !== null && signal.head.callback === slot) {
    signal.head = signal.head.next;
  }
  let current = signal.head;
  while (current !== null && current.next !== null) {
    if (current.next.callback === slot) {
      current.next = current.next.next;
    } else {
      current = current.next;
    }
  }
}

export function isSlotConnected<T extends (...args: any[]) => void>(signal: Signal<T>, slot: T): boolean {
  let node = signal.head;
  while (node !== null) {
    if (node.callback === slot) return true;
    node = node.next;
  }
  return false;
}
