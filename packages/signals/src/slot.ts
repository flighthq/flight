// Generated from crates/flight-signals/src/slot.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { installDefaultSignalEmitter } from './signal.ts';
import type { SignalConnectOptions, SignalData, SignalRaw, SignalSlot, SlotId } from './types.ts';

const NEXT_SIGNAL_SLOT_ID: { value: number } = { value: 1 >>> 0 };

export function clearSignal<T>(signal: SignalRaw<T>): void {
  let state = signal.data!;
  signal.data = undefined;
  signal.emit = (_unused0) => {};
  void state;
}

/**
 * Removes tombstoned entries once the outermost emission exits, and detaches the signal when
 * the array becomes empty (the teardown a disconnect during dispatch defers).
 */
export function compactSignalData<T>(data: SignalData<T> | undefined): boolean {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  const originalLen = signalData.slots.length;
  let write = 0;
  for (let read = 0; read < originalLen; read += 1) {
    if (signalData.slots[read] === undefined) {
      continue;
    }
    if (write !== read) {
      signalData.slots[write] = signalData.slots[read];
      signalData.slots[read] = undefined;
      signalData.ids[write] = signalData.ids[read];
      signalData.priorities[write] = signalData.priorities[read];
      signalData.repeat[write] = signalData.repeat[read];
      signalData.paused[write] = signalData.paused[read];
    }
    write += 1;
  }
  if (write === originalLen) {
    return false;
  }
  const slots: (SignalSlot<T> | undefined)[] = signalData.slots;
  (<T>(items: T[], length: number): void => {
    items.length = Math.min(items.length, length);
  })(slots, write);
  const ids: SlotId[] = signalData.ids;
  (<T>(items: T[], length: number): void => {
    items.length = Math.min(items.length, length);
  })(ids, write);
  const priorities: number[] = signalData.priorities;
  (<T>(items: T[], length: number): void => {
    items.length = Math.min(items.length, length);
  })(priorities, write);
  const repeat: boolean[] = signalData.repeat;
  (<T>(items: T[], length: number): void => {
    items.length = Math.min(items.length, length);
  })(repeat, write);
  const paused: boolean[] = signalData.paused;
  (<T>(items: T[], length: number): void => {
    items.length = Math.min(items.length, length);
  })(paused, write);
  if (write === 0) {
    return true;
  }
  return false;
}

/**
 * Connects a slot and returns its registration id. Higher priority runs first; equal priorities
 * keep insertion order (D4).
 */
export function connectSignal<T>(
  signal: SignalRaw<T>,
  slot: SignalSlot<T>,
  options?: Readonly<SignalConnectOptions>,
): SlotId {
  const priority = options?.priority ?? 0;
  const repeat = !(options?.once ?? false);
  const id: SlotId = {
    value: (() => {
      const previous = NEXT_SIGNAL_SLOT_ID.value;
      NEXT_SIGNAL_SLOT_ID.value = (NEXT_SIGNAL_SLOT_ID.value + 1) >>> 0;
      return previous;
    })(),
  };
  for (;;) {
    initSignalData(signal);
    let state = signal.data!;
    const signalData = state;
    if (signalData === undefined) {
      continue;
    }
    let index = 0;
    while (index < signalData.priorities.length && priority <= signalData.priorities[index]) {
      index += 1;
    }
    const slots: (SignalSlot<T> | undefined)[] = signalData.slots;
    (<T>(items: T[], index: number, value: T): void => {
      if (index > items.length) {
        throw new RangeError('Vec insertion index out of bounds');
      }
      items.splice(index, 0, value);
    })(slots, index, slot);
    const ids: SlotId[] = signalData.ids;
    (<T>(items: T[], index: number, value: T): void => {
      if (index > items.length) {
        throw new RangeError('Vec insertion index out of bounds');
      }
      items.splice(index, 0, value);
    })(ids, index, id);
    const priorities: number[] = signalData.priorities;
    (<T>(items: T[], index: number, value: T): void => {
      if (index > items.length) {
        throw new RangeError('Vec insertion index out of bounds');
      }
      items.splice(index, 0, value);
    })(priorities, index, priority);
    const repeats: boolean[] = signalData.repeat;
    (<T>(items: T[], index: number, value: T): void => {
      if (index > items.length) {
        throw new RangeError('Vec insertion index out of bounds');
      }
      items.splice(index, 0, value);
    })(repeats, index, repeat);
    const paused: boolean[] = signalData.paused;
    (<T>(items: T[], index: number, value: T): void => {
      if (index > items.length) {
        throw new RangeError('Vec insertion index out of bounds');
      }
      items.splice(index, 0, value);
    })(paused, index, false);
    return id;
  }
}

export function countLiveSlots<T>(data: Readonly<SignalData<T>>): number {
  let live = 0;
  for (const slot of data.slots) {
    if (slot !== undefined) {
      live += 1;
    }
  }
  return live;
}

/**
 * Disconnects a registration by id. During a dispatch the entry is tombstoned instead of
 * removed, so an emission already walking the arrays keeps its indices; compaction removes it
 * when the outermost dispatch exits (D4 re-entrancy).
 */
export function disconnectSignal<T>(signal: SignalRaw<T>, id: SlotId): void {
  let state = signal.data!;
  const signalData = state;
  if (signalData === undefined) {
    return;
  }
  const dispatching = signalData.depth > 0;
  let index = signalData.slots.length;
  while (index > 0) {
    index -= 1;
    if (signalData.ids[index].value !== id.value) {
      continue;
    }
    if (dispatching) {
      signalData.slots[index] = undefined;
    } else {
      const slots: (SignalSlot<T> | undefined)[] = signalData.slots;
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(slots, index);
      const ids: SlotId[] = signalData.ids;
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(ids, index);
      const priorities: number[] = signalData.priorities;
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(priorities, index);
      const repeats: boolean[] = signalData.repeat;
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(repeats, index);
      const paused: boolean[] = signalData.paused;
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(paused, index);
    }
  }
  if (!dispatching && signalData.slots.length === 0) {
    signal.data = undefined;
    signal.emit = (_unused0) => {};
  }
}

export function hasSignalSlots<T>(signal: SignalRaw<T>): boolean {
  const state = signal.data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  if (signalData.depth === 0) {
    return signalData.slots.length !== 0;
  }
  return countLiveSlots(signalData) > 0;
}

export function initSignalData<T>(signal: SignalRaw<T>): void {
  let state = signal.data!;
  if (state !== undefined) {
    return;
  }
  signal.data = { slots: [], ids: [], priorities: [], repeat: [], paused: [], cancelled: false, depth: 0 };
  void state;
  installDefaultSignalEmitter(signal);
}

export function isSlotConnected<T>(signal: SignalRaw<T>, id: SlotId): boolean {
  const state = signal.data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  for (let index = 0; index < signalData.slots.length; index += 1) {
    if (signalData.slots[index] !== undefined && signalData.ids[index].value === id.value) {
      return true;
    }
  }
  return false;
}

/**
 * Pauses or resumes one registration in place (priority order is preserved). Returns false when
 * the registration no longer exists, so resuming a torn-down connection cannot resurrect it.
 */
export function setSlotPaused<T>(signal: SignalRaw<T>, id: SlotId, paused: boolean): boolean {
  let state = signal.data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  for (let index = 0; index < signalData.slots.length; index += 1) {
    if (signalData.slots[index] !== undefined && signalData.ids[index].value === id.value) {
      signalData.paused[index] = paused;
      return true;
    }
  }
  return false;
}
