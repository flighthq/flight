import type { DeviceCapabilities } from './DeviceCapabilities';
import type { DeviceDisplayMetrics } from './DeviceDisplayMetrics';
import type { DeviceFormFactor } from './DeviceFormFactor';

// Device identity and environment seam. Free functions in @flighthq/device delegate to the active
// DeviceBackend (web default or a native host's). Snapshot reads fill an `out` value and return it;
// unknown or unavailable fields resolve to sentinels ('' / -1 / false), never throwing.
export interface DeviceInfo {
  arch: string;
  availableMemory: number;
  boardName: string;
  colorGamut: string;
  cpuCores: number;
  fontScale: number;
  formFactor: DeviceFormFactor;
  gpuRenderer: string;
  gpuVendor: string;
  isHdr: boolean;
  isJailbroken: boolean;
  isLowEndDevice: boolean;
  isRooted: boolean;
  isVirtual: boolean;
  manufacturer: string;
  marketingName: string;
  model: string;
  osBuild: string;
  osName: string;
  osVersion: string;
  platformString: string;
  productName: string;
  supportedAbis: readonly string[];
  totalMemory: number;
  webViewVersion: string;
  // Battery state is not here — it is a live, event-bearing concern owned by @flighthq/power
  // (PowerStatus.batteryLevel/isCharging + Power.onChange). DeviceInfo is a static identity snapshot.
}

// Edge insets, in CSS pixels, that keep content clear of notches, rounded corners, and system bars.
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// The swappable backend behind @flighthq/device. Each read fills the caller's `out` value and returns
// it; unknown or unavailable fields resolve to sentinels ('' / -1 / false), never throwing.
export interface DeviceBackend {
  getCapabilities(out: DeviceCapabilities): DeviceCapabilities;
  getDisplayMetrics(out: DeviceDisplayMetrics): DeviceDisplayMetrics;
  getId(): string;
  getInfo(out: DeviceInfo): DeviceInfo;
  getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets;
}
