import type { HostSoftKeyboardCapabilities } from '@flighthq/types/contract';

import { webHostSoftKeyboardChange, webHostSoftKeyboardInfo, webHostSoftKeyboardVisibility } from './webKeyboard.ts';

export const webHostSoftKeyboard = {
  change: webHostSoftKeyboardChange,
  info: webHostSoftKeyboardInfo,
  visibility: webHostSoftKeyboardVisibility,
} satisfies HostSoftKeyboardCapabilities;
