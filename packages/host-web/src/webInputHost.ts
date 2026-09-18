import type { HostInputCapabilities } from '@flighthq/types/contract';

import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostInputTarget } from './webInputTarget';
import { webHostInputIngress } from './webInputIngress';

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  ingress: webHostInputIngress,
  pointerLock: webHostInputPointerLock,
  target: webHostInputTarget,
} satisfies HostInputCapabilities;
