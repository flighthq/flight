import type { HostPowerCapabilities } from '@flighthq/types/contract';

import { webHostPowerChange, webHostPowerKeepAwake, webHostPowerStatus, webHostPowerSuspension } from './webPower.ts';

export const webHostPower = {
  change: webHostPowerChange,
  keepAwake: webHostPowerKeepAwake,
  status: webHostPowerStatus,
  suspension: webHostPowerSuspension,
} satisfies HostPowerCapabilities;
