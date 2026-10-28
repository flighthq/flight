/* eslint-disable @typescript-eslint/no-explicit-any */

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import { nullSignalEmit } from './internal.ts';
import type { Signal } from './signalTypes.ts';

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  const out = allocateEntity<Signal<T>>();
  initializeSignal(out);
  return finishEntity(out);
}

export function initializeSignal<T extends (...args: any[]) => void>(out: EntityConstruction<Signal<T>>): void {
  out.emit = nullSignalEmit as unknown as T;
  out.data = null;
}
