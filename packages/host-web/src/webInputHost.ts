import type { HostInputCapabilities } from '@flighthq/types/contract';

import { webHostInputIngress } from './webInputIngress';
import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostInputTarget } from './webInputTarget';

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  ingress: webHostInputIngress,
  pointerLock: webHostInputPointerLock,
  target: webHostInputTarget,
} satisfies HostInputCapabilities;
