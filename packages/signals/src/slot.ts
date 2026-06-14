/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal, SignalConnectOptions, SignalData } from '@flighthq/types';

import { nullSignalEmit } from './signal';

export type { SignalConnectOptions } from '@flighthq/types';

export function connectSignal<T extends (...args: any[]) => void>(
  signal: Signal<T>,
  slot: T,
  options?: Readonly<SignalConnectOptions>,
): void {
  const priority = options?.priority ?? 0;
  const repeat = !(options?.once ?? false);

  initSignal(signal);
  const data = signal.data!;

  for (let i = 0; i < data.priorities.length; i++) {
    if (priority > data.priorities[i]) {
      data.slots.splice(i, 0, slot);
      data.priorities.splice(i, 0, priority);
      data.repeat.splice(i, 0, repeat);
      return;
    }
  }

  data.slots.push(slot);
  data.priorities.push(priority);
  data.repeat.push(repeat);
}

export function disconnectAllSignals<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  signal.emit = nullSignalEmit as unknown as T;
  signal.data = null;
}

export function disconnectSignal<T extends (...args: any[]) => void>(signal: Signal<T>, slot: T): void {
  const data = signal.data;
  if (data === null) return;

  let i = data.slots.length;
  while (--i >= 0) {
    if (data.slots[i] === slot) {
      data.slots.splice(i, 1);
      data.priorities.splice(i, 1);
      data.repeat.splice(i, 1);
    }
  }

  if (data.slots.length === 0) {
    signal.emit = nullSignalEmit as unknown as T;
    signal.data = null;
  }
}

function initSignal<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  if (signal.data !== null) return;
  const data: SignalData<T> = { slots: [], priorities: [], repeat: [], cancelled: false };
  signal.data = data;
  signal.emit = makeDispatch(data);
}

export function isSlotConnected<T extends (...args: any[]) => void>(signal: Readonly<Signal<T>>, slot: T): boolean {
  return signal.data !== null && signal.data.slots.indexOf(slot) !== -1;
}

function makeDispatch<T extends (...args: any[]) => void>(data: SignalData<T>): T {
  return ((...args: any[]) => {
    data.cancelled = false;
    let i = 0;
    while (i < data.slots.length) {
      data.slots[i](...args);
      if (data.cancelled) break;
      if (!data.repeat[i]) {
        data.slots.splice(i, 1);
        data.priorities.splice(i, 1);
        data.repeat.splice(i, 1);
      } else {
        i++;
      }
    }
  }) as unknown as T;
}
