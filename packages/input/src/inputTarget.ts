// Generated from crates/flight-input/src/input_target.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';

import type { InputTargetHandleRaw } from './types.ts';

/**
 * Allocates an input target handle for a host adapter (TS `InputTargetHandle` is an Entity but the
 * pinned TS package exports no factory).
 */
export function createInputTargetHandle(): InputTargetHandleRaw {
  let out: InputTargetHandleRaw = allocateEntity<InputTargetHandleRaw>();
  initializeInputTargetHandle(out);
  return finishEntity(out);
}

/**
 * Re-initializes an input target handle under construction (D12).
 */
export function initializeInputTargetHandle(_out: InputTargetHandleRaw): void {}
