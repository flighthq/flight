import type { HostAppLoopCapability } from '@flighthq/app/contract';

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
