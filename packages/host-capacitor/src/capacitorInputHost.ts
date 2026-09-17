import type { CapacitorApi, HostHapticsCapabilities, HostSoftKeyboardCapabilities } from '@flighthq/types/contract';

import { capacitorHostHaptics } from './capacitorHaptics';
import {
  capacitorHostSoftKeyboardAccessoryBar,
  capacitorHostSoftKeyboardChange,
  capacitorHostSoftKeyboardInfo,
  capacitorHostSoftKeyboardResizeModeWrite,
  capacitorHostSoftKeyboardScrollAssist,
  capacitorHostSoftKeyboardStyle,
  capacitorHostSoftKeyboardVisibility,
} from './capacitorKeyboard';

// The input-domain groups Capacitor covers. `host.input` itself is empty on mobile — a Capacitor app
// has no ingress, focus, pointer-lock or drop-file surface — while haptics and the soft keyboard are
// independently-coverable groups in their own right.
export function capacitorHostHapticsGroup(capacitor: CapacitorApi): Required<Pick<HostHapticsCapabilities, 'engine'>> {
  return { engine: capacitorHostHaptics(capacitor) };
}

export function capacitorHostSoftKeyboardGroup(
  capacitor: CapacitorApi,
): Required<
  Pick<
    HostSoftKeyboardCapabilities,
    'accessoryBar' | 'change' | 'info' | 'resizeModeWrite' | 'scrollAssist' | 'style' | 'visibility'
  >
> {
  return {
    accessoryBar: capacitorHostSoftKeyboardAccessoryBar(capacitor),
    change: capacitorHostSoftKeyboardChange(capacitor),
    info: capacitorHostSoftKeyboardInfo(capacitor),
    resizeModeWrite: capacitorHostSoftKeyboardResizeModeWrite(capacitor),
    scrollAssist: capacitorHostSoftKeyboardScrollAssist(capacitor),
    style: capacitorHostSoftKeyboardStyle(capacitor),
    visibility: capacitorHostSoftKeyboardVisibility(capacitor),
  };
}
