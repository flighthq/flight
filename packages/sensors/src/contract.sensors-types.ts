// Acyclic build entry selected by contract-only projects through the `.sensors-types` module suffix.
// The published @flighthq/sensors/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  AmbientLightReading,
  HostSensorsCapabilities,
  HostSensorsCapability,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  SensorAccuracy,
  SensorReading,
  Sensors,
  SensorsPermissionState,
  SensorSubscribeOptions,
} from './types.ts';
