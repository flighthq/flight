/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Slot } from './Slot';

export interface Signal<T extends (...args: any[]) => void> {
  canceled: boolean;
  head: Slot<T> | null;
}
