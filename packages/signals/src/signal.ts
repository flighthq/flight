/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

export type { Signal } from '@flighthq/types';

export const noop = (): void => {};

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  return { emit: noop as unknown as T, data: null };
}
