/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal, SignalConnectOptions, SignalData } from '@flighthq/types/contract';

import { nullSignalEmit } from './internal';

export function clearSignal<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  signal.emit = nullSignalEmit as unknown as T;
  signal.data = null;
}

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

export function disconnectSignal<T extends (...args: any[]) => void>(signal: Signal<T>, slot: T): void {
  const data = signal.data;
  if (data === null) return;

  // Inside a dispatch the entry is tombstoned, not spliced: a dispatch already walking these arrays
  // holds an index into them, and removing a cell would shift every later entry down past its cursor.
  const dispatching = data.depth > 0;
  let i = data.slots.length;
  while (--i >= 0) {
    if (data.slots[i] !== slot) continue;
    if (dispatching) {
      data.slots[i] = null;
      continue;
    }
    data.slots.splice(i, 1);
    data.priorities.splice(i, 1);
    data.repeat.splice(i, 1);
  }

  // Teardown waits for the outermost dispatch to finish; compaction performs it instead. Detaching
  // here would leave the running loop walking arrays the signal no longer refers to.
  if (!dispatching && data.slots.length === 0) {
    signal.emit = nullSignalEmit as unknown as T;
    signal.data = null;
  }
}

export function hasSignalSlots<T extends (...args: any[]) => void>(signal: Readonly<Signal<T>>): boolean {
  const data = signal.data;
  if (data === null) return false;
  // Outside a dispatch there are no tombstones, so length answers it at the original cost. Inside one
  // the array may hold dead entries, and a caller asking from within a slot must not be told that a
  // signal it just emptied still has listeners.
  if (data.depth === 0) return data.slots.length > 0;
  return countLiveSlots(data) > 0;
}

function initSignal<T extends (...args: any[]) => void>(signal: Signal<T>): void {
  if (signal.data !== null) return;
  const data: SignalData<T> = { slots: [], priorities: [], repeat: [], cancelled: false, depth: 0 };
  signal.data = data;
  signal.emit = makeDispatch(signal, data);
}

export function isSlotConnected<T extends (...args: any[]) => void>(signal: Readonly<Signal<T>>, slot: T): boolean {
  return signal.data !== null && signal.data.slots.indexOf(slot) !== -1;
}

// The dispatch closes over the signal as well as its data so the outermost exit can restore the
// no-slot emit. Compaction is the only place teardown happens once a dispatch is in flight.
function makeDispatch<T extends (...args: any[]) => void>(signal: Signal<T>, data: SignalData<T>): T {
  return ((...args: any[]) => {
    data.cancelled = false;
    data.depth++;
    let i = 0;
    while (i < data.slots.length) {
      const slot = data.slots[i];
      if (slot === null) {
        i++;
        continue;
      }
      slot(...args);
      if (data.cancelled) break;
      // A once slot leaves its cell in place for the same reason a disconnect does; the cursor moves
      // on rather than staying put for an entry that shifted into this index.
      if (!data.repeat[i]) data.slots[i] = null;
      i++;
    }
    data.depth--;
    if (data.depth === 0) compactSignalData(signal, data);
  }) as unknown as T;
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
  // A signal emptied during dispatch detaches here, which is the teardown disconnectSignal deferred.
  // Only the signal still pointing at this data is detached: a clearSignal mid-dispatch already
  // replaced it, and stealing that newer state back would undo an explicit caller action.
  if (write === 0 && signal.data === data) {
    signal.emit = nullSignalEmit as unknown as T;
    signal.data = null;
  }
}

function countLiveSlots<T extends (...args: any[]) => void>(data: Readonly<SignalData<T>>): number {
  let live = 0;
  for (let i = 0; i < data.slots.length; i++) {
    if (data.slots[i] !== null) live++;
  }
  return live;
}
