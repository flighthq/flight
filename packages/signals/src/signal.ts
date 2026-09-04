/* eslint-disable @typescript-eslint/no-explicit-any */

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Signal } from '@flighthq/types/contract';

import { nullSignalEmit } from './internal';

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  const out = allocateEntity<Signal<T>>();
  initializeSignal(out);
  return finishEntity(out);
}

export function initializeSignal<T extends (...args: any[]) => void>(out: EntityConstruction<Signal<T>>): void {
  out.emit = nullSignalEmit as unknown as T;
  out.data = null;
}
