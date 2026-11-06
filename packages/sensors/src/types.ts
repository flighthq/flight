import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

export type SensorAccuracy = 'high' | 'low' | 'medium' | 'unknown';

export type SensorsPermissionState = 'denied' | 'granted' | 'prompt' | 'unsupported';

export interface SensorSubscribeOptions {
  frequency?: number;
}

export interface SensorReading {
  accuracy: SensorAccuracy;
  interval: number;
  timestamp: number;
}

export interface AmbientLightReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  illuminance: number;
}

export interface MotionReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
  z: number;
}

export interface OrientationReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  alpha: number;
  beta: number;
  gamma: number;
  absolute: boolean;
  heading: number;
}

export interface PressureReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  altitude: number;
  pressure: number;
}

export interface ProximityReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  distance: number;
  max: number;
  near: boolean;
}

export interface QuaternionReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface RotationRateReading extends EntityRaw, SensorReading {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface HostSensorsCapability {
  getPermissionState(sensor?: 'magnetometer' | 'motion' | 'orientation'): Promise<SensorsPermissionState>;
  isAmbientLightSupported(): boolean;
  isBarometerSupported(): boolean;
  isGravitySupported(): boolean;
  isGyroscopeSupported(): boolean;
  isLinearAccelerationSupported(): boolean;
  isMagnetometerSupported(): boolean;
  isMotionSupported(): boolean;
  isOrientationSupported(): boolean;
  isProximitySupported(): boolean;
  requestPermission(): Promise<boolean>;
  subscribeAbsoluteOrientation(
    listener: (orientation: Readonly<OrientationReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeAmbientLight(
    listener: (reading: Readonly<AmbientLightReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeBarometer(
    listener: (reading: Readonly<PressureReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeGravity(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeLinearAcceleration(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeMagnetometer(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeMotion(
    listener: (acceleration: Readonly<MotionReading>, rotationRate: Readonly<RotationRateReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeOrientation(
    listener: (orientation: Readonly<OrientationReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeProximity(
    listener: (reading: Readonly<ProximityReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  subscribeQuaternion(
    listener: (reading: Readonly<QuaternionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
}

export interface HostSensorsCapabilities {
  readonly query?: HostSensorsCapability;
}

export interface Sensors extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  onAbsoluteOrientation: Signal<Readonly<OrientationReading>>;
  onAccelerometer: Signal<Readonly<MotionReading>>;
  onAmbientLight: Signal<Readonly<AmbientLightReading>>;
  onBarometer: Signal<Readonly<PressureReading>>;
  onGravity: Signal<Readonly<MotionReading>>;
  onGyroscope: Signal<Readonly<RotationRateReading>>;
  onLinearAcceleration: Signal<Readonly<MotionReading>>;
  onMagnetometer: Signal<Readonly<MotionReading>>;
  onOrientation: Signal<Readonly<OrientationReading>>;
  onProximity: Signal<Readonly<ProximityReading>>;
  onQuaternion: Signal<Readonly<QuaternionReading>>;
}
