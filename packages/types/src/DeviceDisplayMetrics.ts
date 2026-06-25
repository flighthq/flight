// Built-in display metrics for the running device, filled by DeviceBackend.getDisplayMetrics.
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
