import type { HostTargetCapabilities } from '@flighthq/types/contract';

import { webHostTarget, webHostTargetResize } from './webHostTarget';

export const webHostTargetGroup = {
  prepare: webHostTarget,
  resize: webHostTargetResize,
} satisfies HostTargetCapabilities;
