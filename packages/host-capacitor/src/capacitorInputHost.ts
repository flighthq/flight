import type { CapacitorApi, HostInputCapabilities } from '@flighthq/types/contract';

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

export function capacitorHostInput(
  capacitor: CapacitorApi,
): HostInputCapabilities &
  Required<
    Pick<
      HostInputCapabilities,
      | 'haptics'
      | 'softKeyboardAccessoryBar'
      | 'softKeyboardChange'
      | 'softKeyboardInfo'
      | 'softKeyboardResizeModeWrite'
      | 'softKeyboardScrollAssist'
      | 'softKeyboardStyle'
      | 'softKeyboardVisibility'
    >
  > {
  return {
    haptics: capacitorHostHaptics(capacitor),
    softKeyboardAccessoryBar: capacitorHostSoftKeyboardAccessoryBar(capacitor),
    softKeyboardChange: capacitorHostSoftKeyboardChange(capacitor),
    softKeyboardInfo: capacitorHostSoftKeyboardInfo(capacitor),
    softKeyboardResizeModeWrite: capacitorHostSoftKeyboardResizeModeWrite(capacitor),
    softKeyboardScrollAssist: capacitorHostSoftKeyboardScrollAssist(capacitor),
    softKeyboardStyle: capacitorHostSoftKeyboardStyle(capacitor),
    softKeyboardVisibility: capacitorHostSoftKeyboardVisibility(capacitor),
  };
}
