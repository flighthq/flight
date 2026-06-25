import type { Signal } from './Signal';

// Reported confidence of a sensor reading. 'unknown' when the host does not supply an accuracy level.
export type SensorAccuracy = 'high' | 'low' | 'medium' | 'unknown';

// Permission state for a gated sensor (iOS motion/orientation gating). 'unsupported' when the
// device has no such sensor.
export type SensorsPermissionState = 'denied' | 'granted' | 'prompt' | 'unsupported';

// Options for a sensor subscription. `frequency` is the requested delivery rate in hertz where the
// host honors it (the Generic Sensor API); window-event streams ignore it and fire at the browser default.
export interface SensorSubscribeOptions {
  frequency?: number;
}

// Fields shared by every sensor reading: confidence, the sampling interval in milliseconds (-1 when
// unknown), and a host timestamp in milliseconds (-1 when unknown).
export interface SensorReading {
  accuracy: SensorAccuracy;
  interval: number;
  timestamp: number;
}

// Ambient illuminance in lux.
export interface AmbientLightReading extends SensorReading {
  illuminance: number;
}

// A three-axis vector reading in m/s² (accelerometer, linear acceleration, gravity) or microtesla
// (magnetometer).
export interface MotionReading extends SensorReading {
  x: number;
  y: number;
  z: number;
}

// Device orientation as Euler angles (alpha/beta/gamma in degrees).
export interface OrientationReading extends SensorReading {
  alpha: number;
  beta: number;
  gamma: number;
  // True when the reading is relative to Earth's frame (absolute orientation) rather than an arbitrary start.
  absolute: boolean;
  // Compass heading in degrees, or -1 when the host cannot supply one.
  heading: number;
}

// Barometric pressure in hectopascals, with a derived altitude in meters (-1 when underivable).
export interface PressureReading extends SensorReading {
  altitude: number;
  pressure: number;
}

// Proximity reading. `near` is the boolean near/far state; `distance` and `max` are in centimeters
// and -1 when only near/far is known.
export interface ProximityReading extends SensorReading {
  distance: number;
  max: number;
  near: boolean;
}

// Orientation as a unit quaternion (w/x/y/z).
export interface QuaternionReading extends SensorReading {
  w: number;
  x: number;
  y: number;
  z: number;
}

// Angular velocity in deg/s around the device z/x/y axes (alpha/beta/gamma).
export interface RotationRateReading extends SensorReading {
  alpha: number;
  beta: number;
  gamma: number;
}

// Event seam for device motion and orientation sensors: independent per-sensor subscriptions, support
// queries, and permission handling. The web backend wraps the devicemotion / deviceorientation window
// events plus the Generic Sensor API; a native host reports its own readings through the same callbacks.
//
// Each subscribe* registers a listener and returns an unsubscribe function. Readings handed to listeners
// may be scratch-reused; listeners must copy values they need to outlive the callback.
export interface SensorsBackend {
  // Current permission state for the given gated sensor, without prompting; 'unsupported' when absent.
  getPermissionState(sensor?: 'magnetometer' | 'motion' | 'orientation'): Promise<SensorsPermissionState>;
  // True when ambient light sensing is available.
  isAmbientLightSupported(): boolean;
  // True when barometric pressure sensing is available.
  isBarometerSupported(): boolean;
  // True when the gravity vector sensor (or its derivation) is available.
  isGravitySupported(): boolean;
  // True when the gyroscope (rotation rate) sensor is available.
  isGyroscopeSupported(): boolean;
  // True when the linear acceleration (gravity-removed) sensor is available.
  isLinearAccelerationSupported(): boolean;
  // True when the magnetometer sensor is available.
  isMagnetometerSupported(): boolean;
  // True when the accelerometer (including gravity) is available.
  isMotionSupported(): boolean;
  // True when the device orientation sensor is available.
  isOrientationSupported(): boolean;
  // True when a proximity sensor is available.
  isProximitySupported(): boolean;
  // Requests sensor permission where the host gates it (iOS); resolves true when granted or ungated.
  requestPermission(): Promise<boolean>;
  // Registers a listener invoked with absolute (Earth-frame) orientation readings; returns unsubscribe.
  subscribeAbsoluteOrientation(
    listener: (orientation: Readonly<OrientationReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with ambient light readings; returns unsubscribe.
  subscribeAmbientLight(
    listener: (reading: Readonly<AmbientLightReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with barometric pressure readings; returns unsubscribe.
  subscribeBarometer(
    listener: (reading: Readonly<PressureReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with gravity vector readings (m/s²); returns unsubscribe.
  subscribeGravity(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with gravity-removed linear acceleration readings; returns unsubscribe.
  subscribeLinearAcceleration(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with magnetometer readings (x/y/z in microtesla); returns unsubscribe.
  subscribeMagnetometer(
    listener: (reading: Readonly<MotionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with acceleration and rotation rate readings; returns unsubscribe.
  subscribeMotion(
    listener: (acceleration: Readonly<MotionReading>, rotationRate: Readonly<RotationRateReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with orientation readings; returns an unsubscribe function.
  subscribeOrientation(
    listener: (orientation: Readonly<OrientationReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with proximity readings; returns unsubscribe.
  subscribeProximity(
    listener: (reading: Readonly<ProximityReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
  // Registers a listener invoked with quaternion orientation readings; returns unsubscribe.
  subscribeQuaternion(
    listener: (reading: Readonly<QuaternionReading>) => void,
    options?: Readonly<SensorSubscribeOptions>,
  ): () => void;
}

// Device sensor event entity. Enable delivery with attachSensors; the signals stay inert until then.
export interface Sensors {
  onAbsoluteOrientation: Signal<(reading: Readonly<OrientationReading>) => void>;
  onAccelerometer: Signal<(reading: Readonly<MotionReading>) => void>;
  onAmbientLight: Signal<(reading: Readonly<AmbientLightReading>) => void>;
  onBarometer: Signal<(reading: Readonly<PressureReading>) => void>;
  onGravity: Signal<(reading: Readonly<MotionReading>) => void>;
  onGyroscope: Signal<(reading: Readonly<RotationRateReading>) => void>;
  onLinearAcceleration: Signal<(reading: Readonly<MotionReading>) => void>;
  onMagnetometer: Signal<(reading: Readonly<MotionReading>) => void>;
  onOrientation: Signal<(reading: Readonly<OrientationReading>) => void>;
  onProximity: Signal<(reading: Readonly<ProximityReading>) => void>;
  onQuaternion: Signal<(reading: Readonly<QuaternionReading>) => void>;
}
