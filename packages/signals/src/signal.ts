/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

import { nullSignalEmit } from './internal';

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  return { emit: nullSignalEmit as unknown as T, data: null };
}
