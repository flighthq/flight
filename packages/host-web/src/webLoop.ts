import type { ApplicationVisibilityBackend, LoopBackend } from '@flighthq/types/contract';

export const webApplicationVisibilityBackend: ApplicationVisibilityBackend = {
  isVisible() {
    return typeof document === 'undefined' || !document.hidden;
  },
};

export const webLoopBackend: LoopBackend = {
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
