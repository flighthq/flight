// Acyclic build entry selected by contract-only projects through the `.device-types` module suffix.
// The published @flighthq/device/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  HostDeviceCapabilities,
  HostDeviceCapability,
  SafeAreaInsets,
} from './types.ts';
