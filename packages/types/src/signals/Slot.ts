/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Slot<T extends (...args: any[]) => void> {
  callback: T;
  next: Slot<T> | null;
  once: boolean;
  priority: number;
}
