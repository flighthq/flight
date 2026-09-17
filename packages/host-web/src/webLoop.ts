import type { HostLoopCapability } from '@flighthq/types/contract';

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
