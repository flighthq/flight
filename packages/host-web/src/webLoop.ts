import type { HostApplicationVisibilityProvider, HostLoopProvider } from '@flighthq/types/contract';

export const webHostApplicationVisibility: HostApplicationVisibilityProvider = {
  isVisible() {
    return typeof document === 'undefined' || !document.hidden;
  },
};

export const webHostLoop: HostLoopProvider = {
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
