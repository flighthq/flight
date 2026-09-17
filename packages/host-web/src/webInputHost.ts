import type { HostInputCapabilities } from '@flighthq/types/contract';

import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostTarget } from './webHostTarget';
import { webHostInputIngress } from './webInputIngress';

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  ingress: webHostInputIngress,
  pointerLock: webHostInputPointerLock,
  target: webHostTarget,
} satisfies HostInputCapabilities;
