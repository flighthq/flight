import type { HostAppLoopCapability } from '@flighthq/types/contract';

export const webHostLoop: HostAppLoopCapability = {
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
