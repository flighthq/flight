// Generated from crates/flight-signals/src/safe.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { signalDataCancelled } from './emitter.ts';
import { compactSignalData } from './slot.ts';
import type { SignalData, SignalRaw, SignalSlot, SlotId } from './types.ts';

/**
 * Emits to the priority-ordered set captured at emission start (TS `emitSignalSafe`).
 *
 * Connections added while the snapshot runs wait for a later emission; a connection removed
 * after the snapshot was captured still receives this emission. Nested safe emissions take
 * their own snapshot. Once registrations are consumed before they are invoked, so a nested
 * safe emission cannot repeat one.
 */
export function emitSignalSafe<T>(signal: SignalRaw<T>, args: T): void {
  const snapshot = takeSafeSignalSnapshot(signal.data);
  if (snapshot === undefined) {
    return;
  }
  const [slots, ids, repeat, paused] = snapshot;
  for (let index = 0; index < slots.length; index += 1) {
    {
      const $slot = slots[index];
      if ($slot !== undefined) {
        const slot = $slot;
        if (!paused[index]) {
          if (!repeat[index]) {
            tombstoneOnceSlot(signal.data, ids[index]);
          }
          slot(args);
          if (signalDataCancelled(signal.data)) {
            break;
          }
        }
      }
    }
  }
  if (endSafeSignalDispatch(signal.data) && compactSignalData(signal.data)) {
    signal.data = undefined;
    signal.emit = (_unused0) => {};
  }
}

function takeSafeSignalSnapshot<T>(
  data: SignalData<T> | undefined,
): readonly [(SignalSlot<T> | undefined)[], SlotId[], boolean[], boolean[]] | undefined {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return undefined;
  }
  let slots: (SignalSlot<T> | undefined)[] = [] as never[];
  for (const slot of signalData.slots) {
    slots.push(slot);
  }
  let ids: SlotId[] = [] as never[];
  for (const id of signalData.ids) {
    ids.push(id);
  }
  let repeat: boolean[] = [] as never[];
  for (const value of signalData.repeat) {
    repeat.push(value);
  }
  let paused: boolean[] = [] as never[];
  for (const value of signalData.paused) {
    paused.push(value);
  }
  signalData.cancelled = false;
  signalData.depth += 1;
  return [slots, ids, repeat, paused];
}

function endSafeSignalDispatch<T>(data: SignalData<T> | undefined): boolean {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return false;
  }
  signalData.depth -= 1;
  return signalData.depth === 0;
}

function tombstoneOnceSlot<T>(data: SignalData<T> | undefined, id: SlotId): void {
  let state = data!;
  const signalData = state;
  if (signalData === undefined) {
    return;
  }
  for (let index = 0; index < signalData.slots.length; index += 1) {
    if (
      signalData.slots[index] !== undefined &&
      signalData.ids[index].value === id.value &&
      !signalData.repeat[index]
    ) {
      signalData.slots[index] = undefined;
      return;
    }
  }
}
