import type { HostInputCapabilities } from '@flighthq/types/contract';

import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock } from './webHostTarget';
import { webHostInputIngress } from './webInputIngress';

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  ingress: webHostInputIngress,
  pointerLock: webHostInputPointerLock,
} satisfies HostInputCapabilities;
