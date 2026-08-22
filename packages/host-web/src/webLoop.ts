import { createWebLoopBackend, installLoopHostBackend, observeLoopHostResult } from '@flighthq/application/contract';
import type { LoopBackend } from '@flighthq/types/contract';

export function enableHostWebLoop(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebLoopBackend();
  const backend: LoopBackend = {
    requestFrame(callback: (time: number) => void): number {
      try {
        const handle = inner.requestFrame(callback);
        observeLoopHostResult('requestFrame', true);
        return handle;
      } catch {
        observeLoopHostResult('requestFrame', false);
        return 0;
      }
    },
    cancelFrame(handle: number): void {
      try {
        inner.cancelFrame(handle);
        observeLoopHostResult('cancelFrame', true);
      } catch {
        observeLoopHostResult('cancelFrame', false);
      }
    },
    now(): number {
      return inner.now();
    },
  };
  installLoopHostBackend(backend);
}

export function resetHostWebLoopForTest(): void {
  _enabled = false;
}

let _enabled = false;
