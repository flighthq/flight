/* eslint-disable @typescript-eslint/no-explicit-any */

import { createEntity } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/types/contract';

import { nullSignalEmit } from './internal';

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  return createEntity({ emit: nullSignalEmit as unknown as T, data: null });
}
