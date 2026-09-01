/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal, SignalData } from '@flighthq/types/contract';

import { nullSignalEmit } from './internal';

/**
 * Emits to the priority-ordered listener set captured at emission start.
 *
 * Connections added while this snapshot is running wait for a later emission. A connection removed
 * after the snapshot was captured still receives this emission. Nested safe emissions capture their
 * own listener set. This deterministic mutation behavior costs one copy of each dispatch lane.
 */
export function emitSignalSafe<T extends (...args: any[]) => void>(signal: Signal<T>, ...args: Parameters<T>): void {
  const data = signal.data;
  if (data === null) return;

  const slots = data.slots.slice();
  const priorities = data.priorities.slice();
  const repeat = data.repeat.slice();
  data.cancelled = false;
  data.depth++;
  try {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot === null) continue;
      // Consume once registrations before invoking them so a once callback cannot repeat itself by
      // nesting another safe emission. A copied slot remains callable if another listener removed it.
      if (!repeat[i]) tombstoneOnceSlot(data, slot, priorities[i]);
      slot(...args);
      if (data.cancelled) break;
    }
  } finally {
    data.depth--;
    if (data.depth === 0) compactSignalData(signal, data);
  }
}

function tombstoneOnceSlot<T extends (...args: any[]) => void>(data: SignalData<T>, slot: T, priority: number): void {
  for (let i = 0; i < data.slots.length; i++) {
    if (data.slots[i] !== slot || data.repeat[i] || data.priorities[i] !== priority) continue;
    data.slots[i] = null;
    return;
  }
}

function compactSignalData<T extends (...args: any[]) => void>(signal: Signal<T>, data: SignalData<T>): void {
  let write = 0;
  for (let read = 0; read < data.slots.length; read++) {
    if (data.slots[read] === null) continue;
    if (write !== read) {
      data.slots[write] = data.slots[read];
      data.priorities[write] = data.priorities[read];
      data.repeat[write] = data.repeat[read];
    }
    write++;
  }
  if (write === data.slots.length) return;
  data.slots.length = write;
  data.priorities.length = write;
  data.repeat.length = write;
  if (write === 0 && signal.data === data) {
    signal.emit = nullSignalEmit as unknown as T;
    signal.data = null;
  }
}
