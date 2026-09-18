import type { HostTargetCapabilities } from '@flighthq/types/contract';

import { webHostTarget, webHostTargetDisplay, webHostTargetResize } from './webHostTarget';

export const webHostTargetGroup = {
  display: webHostTargetDisplay,
  prepare: webHostTarget,
  resize: webHostTargetResize,
} satisfies HostTargetCapabilities;
