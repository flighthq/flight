/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

export type { Signal } from '@flighthq/types';

export function createSignal<T extends (...args: any[]) => void>(): Signal<T> {
  return { canceled: false, head: null };
}
