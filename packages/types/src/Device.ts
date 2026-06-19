// Device identity and environment seam. Free functions in @flighthq/device delegate to the active
// DeviceBackend (web default or a native host's). Snapshot reads fill an `out` value and return it;
// unknown or unavailable fields resolve to sentinels ('' / -1 / false), never throwing.
export interface DeviceInfo {
  model: string;
  manufacturer: string;
  osName: string;
  osVersion: string;
  platform: string;
  isVirtual: boolean;
  memory: number;
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

export interface DeviceBackend {
  getInfo(out: DeviceInfo): DeviceInfo;
  getSafeAreaInsets(out: SafeAreaInsets): SafeAreaInsets;
}
