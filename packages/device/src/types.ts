import type { DeviceFormFactor } from '@flighthq/useragent/contract';

// Input/hardware capability flags for the running device, filled by HostDeviceCapability.getCapabilities.
// Only surfaces capabilities with no dedicated package owner; richer pointer/keyboard event handling
// lives in @flighthq/input and @flighthq/interaction. Unknown capabilities resolve to false.
export interface DeviceCapabilities {
  hasKeyboard: boolean;
  hasMouse: boolean;
  hasStylus: boolean;
}

// Built-in display metrics for the running device, filled by HostDeviceCapability.getDisplayMetrics.
// For live multi-display enumeration and work-area geometry, use @flighthq/screen. Unknown or
// unavailable fields resolve to the -1 sentinel, never throwing.
export interface DeviceDisplayMetrics {
  colorDepth: number;
  densityDpi: number;
  logicalHeight: number;
  logicalWidth: number;
  physicalHeight: number;
  physicalWidth: number;
  pixelRatio: number;
}

// Device identity and environment seam. Free functions in @flighthq/device delegate to the active
// HostDeviceCapability (web default or a native host's). Snapshot reads fill an `out` value and return it;
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

// The swappable backend behind @flighthq/device. Each read fills the caller's `out` value; unknown or
// unavailable fields resolve to sentinels ('' / -1 / false), never throwing.
export interface HostDeviceCapability {
  getCapabilities(out: DeviceCapabilities): void;
  getDisplayMetrics(out: DeviceDisplayMetrics): void;
  getId(): string;
  getInfo(out: DeviceInfo): void;
  getSafeAreaInsets(out: SafeAreaInsets): void;
  refresh?(): void;
}

/** The complete device capability group. An omitted slot is capability absence. */
export interface HostDeviceCapabilities {
  readonly info?: HostDeviceCapability;
}
