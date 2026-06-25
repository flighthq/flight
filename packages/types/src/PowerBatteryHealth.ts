// Detailed battery health report, distinct from the live PowerStatus snapshot. Hosts that cannot
// report a given field use the sentinel -1 (numeric) or 'Unknown' (state). The web backend cannot
// report any of these and returns null from getBatteryHealth rather than a filled struct.
export interface PowerBatteryHealth {
  // Remaining capacity relative to design capacity in the 0..1 range, or -1 when unreported.
  capacityWearLevel: number;
  // Completed charge cycles, or -1 when unreported.
  cycleCount: number;
  healthState: PowerBatteryHealthState;
  // Battery temperature in degrees Celsius, or -1 when unreported.
  temperatureCelsius: number;
  // Battery voltage in volts, or -1 when unreported.
  voltage: number;
}

export type PowerBatteryHealthState = 'Good' | 'Fair' | 'Poor' | 'Unknown';
