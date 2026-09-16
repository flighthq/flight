import type { HostApplicationVisibilityCapability, HostLoopCapability } from '@flighthq/types/contract';

export const webHostApplicationVisibility: HostApplicationVisibilityCapability = {
  isVisible() {
    return typeof document === 'undefined' || !document.hidden;
  },
};

export const webHostLoop: HostLoopCapability = {
  cancelFrame(handle) {
    cancelAnimationFrame(handle as number);
  },
  now() {
    return performance.now();
  },
  requestFrame(callback) {
    return requestAnimationFrame(callback);
  },
};
