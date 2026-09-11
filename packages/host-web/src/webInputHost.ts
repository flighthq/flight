import type { HostInputCapabilities } from '@flighthq/types/contract';

import { webHostHaptics } from './webHaptics';
import { webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostInputTarget } from './webInputTarget';
import { webHostSoftKeyboardChange, webHostSoftKeyboardInfo, webHostSoftKeyboardVisibility } from './webKeyboard';

export const webHostInput = {
  dropFile: webHostInputDropFile,
  focus: webHostInputFocus,
  haptics: webHostHaptics,
  pointerLock: webHostInputPointerLock,
  softKeyboardChange: webHostSoftKeyboardChange,
  softKeyboardInfo: webHostSoftKeyboardInfo,
  softKeyboardVisibility: webHostSoftKeyboardVisibility,
  target: webHostInputTarget,
} satisfies HostInputCapabilities;
