import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  AmbientLightReading,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  Sensors,
  SensorsBackend,
  SensorsPermissionState,
  SensorSubscribeOptions,
} from '@flighthq/types';

// Begins delivering sensor readings to `sensors`'s signals by subscribing to the active backend's
// streams. Idempotent: a prior subscription is torn down first. Pair with detachSensors/disposeSensors.
//
// Readings passed to signal listeners are scratch-reused objects. Listeners must not retain a
// reference to a reading across callback boundaries — copy the values if they need to outlive the call.
export function attachSensors(sensors: Sensors): void {
  detachSensors(sensors);
  const backend = getSensorsBackend();

  const unsubscribeMotion = backend.subscribeMotion((acceleration, rotationRate) => {
    emitSignal(sensors.onAccelerometer, acceleration);
    emitSignal(sensors.onGyroscope, rotationRate);
  });
  const unsubscribeLinearAcceleration = backend.subscribeLinearAcceleration((reading) => {
    emitSignal(sensors.onLinearAcceleration, reading);
  });
  const unsubscribeGravity = backend.subscribeGravity((reading) => {
    emitSignal(sensors.onGravity, reading);
  });
  const unsubscribeOrientation = backend.subscribeOrientation((orientation) => {
    emitSignal(sensors.onOrientation, orientation);
  });
  const unsubscribeAbsoluteOrientation = backend.subscribeAbsoluteOrientation((orientation) => {
    emitSignal(sensors.onAbsoluteOrientation, orientation);
  });
  const unsubscribeMagnetometer = backend.subscribeMagnetometer((reading) => {
    emitSignal(sensors.onMagnetometer, reading);
  });
  const unsubscribeAmbientLight = backend.subscribeAmbientLight((reading) => {
    emitSignal(sensors.onAmbientLight, reading);
  });
  const unsubscribeBarometer = backend.subscribeBarometer((reading) => {
    emitSignal(sensors.onBarometer, reading);
  });
  const unsubscribeProximity = backend.subscribeProximity((reading) => {
    emitSignal(sensors.onProximity, reading);
  });
  const unsubscribeQuaternion = backend.subscribeQuaternion((reading) => {
    emitSignal(sensors.onQuaternion, reading);
  });

  _subscriptions.set(sensors, () => {
    unsubscribeAbsoluteOrientation();
    unsubscribeAmbientLight();
    unsubscribeBarometer();
    unsubscribeGravity();
    unsubscribeLinearAcceleration();
    unsubscribeMagnetometer();
    unsubscribeMotion();
    unsubscribeOrientation();
    unsubscribeProximity();
    unsubscribeQuaternion();
  });
}

// Extracts Euler angles (alpha/beta/gamma in degrees) from a quaternion into an OrientationReading,
// using the ZXY convention that matches the W3C deviceorientation spec. Propagates interval,
// timestamp, and accuracy from the quaternion. Writes into `out`.
// Safe when `out` aliases any field of `quaternion` because all inputs are read first.
export function computeEulerFromQuaternion(out: OrientationReading, quaternion: Readonly<QuaternionReading>): void {
  const x = quaternion.x;
  const y = quaternion.y;
  const z = quaternion.z;
  const w = quaternion.w;
  // ZXY (yaw-pitch-roll) decomposition matching deviceorientation alpha/beta/gamma convention.
  const sinBeta = 2 * (w * x - y * z);
  const beta = Math.abs(sinBeta) >= 1 ? (Math.sign(sinBeta) * Math.PI) / 2 : Math.asin(sinBeta);
  const alpha = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
  const gamma = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
  const toDeg = 180 / Math.PI;
  out.alpha = (((alpha * toDeg) % 360) + 360) % 360; // normalize to [0, 360)
  out.beta = beta * toDeg;
  out.gamma = gamma * toDeg;
  out.interval = quaternion.interval;
  out.timestamp = quaternion.timestamp;
  out.accuracy = quaternion.accuracy;
}

// Derives the gravity vector (m/s²) from Euler orientation angles (alpha/beta/gamma in degrees)
// into a MotionReading. The result is the device-frame projection of the 9.81 m/s² downward
// gravity vector onto each device axis. Writes into `out`.
// Safe when `out` aliases any field of `orientation` because all inputs are read first.
export function computeGravityFromOrientation(out: MotionReading, orientation: Readonly<OrientationReading>): void {
  const toRad = Math.PI / 180;
  const b = orientation.beta * toRad;
  const g = orientation.gamma * toRad;
  // Gravity components in device frame. g is 9.81 m/s².
  const G = 9.80665;
  const sinG = Math.sin(g);
  const cosG = Math.cos(g);
  const sinB = Math.sin(b);
  const cosB = Math.cos(b);
  out.x = G * cosB * sinG;
  out.y = -G * sinB;
  out.z = G * cosB * cosG;
  out.interval = orientation.interval;
  out.timestamp = orientation.timestamp;
  out.accuracy = orientation.accuracy;
}

// Derives an approximate quaternion from Euler orientation angles (alpha/beta/gamma in degrees).
// Uses the ZXY convention matching the deviceorientation spec. Writes into `out`.
// Safe when `out` aliases any field of `orientation` because all inputs are read first.
export function computeQuaternionFromOrientationReading(
  out: QuaternionReading,
  orientation: Readonly<OrientationReading>,
): void {
  const toRad = Math.PI / 180;
  const a = orientation.alpha * toRad * 0.5;
  const b = orientation.beta * toRad * 0.5;
  const g = orientation.gamma * toRad * 0.5;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cg = Math.cos(g);
  const sg = Math.sin(g);
  out.x = sa * sb * cg - ca * cb * sg;
  out.y = sa * cb * sg + ca * sb * cg;
  out.z = ca * cb * sg - sa * sb * cg;
  out.w = ca * cb * cg + sa * sb * sg;
  out.interval = orientation.interval;
  out.timestamp = orientation.timestamp;
  out.accuracy = orientation.accuracy;
}

// Converts a quaternion reading into a 3×3 rotation matrix written to `out` (column-major, 9
// elements). Safe when `out` aliases any field of `quaternion` because all inputs are read first.
export function computeRotationMatrixFromQuaternion(out: number[], quaternion: Readonly<QuaternionReading>): void {
  const x = quaternion.x;
  const y = quaternion.y;
  const z = quaternion.z;
  const w = quaternion.w;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = xy - wz;
  out[4] = 1 - (xx + zz);
  out[5] = yz + wx;
  out[6] = xz + wy;
  out[7] = yz - wx;
  out[8] = 1 - (xx + yy);
}

// Compensates an OrientationReading for the current screen rotation angle (in degrees, clockwise,
// as returned by screen.orientation.angle). Raw deviceorientation angles are in device-physical
// frame; this function rotates alpha/beta/gamma so they are relative to the current screen
// orientation. Writes into `out`. Safe when `out` aliases `orientation` because all inputs are read first.
export function computeScreenRelativeOrientation(
  out: OrientationReading,
  orientation: Readonly<OrientationReading>,
  screenAngle: number,
): void {
  const alpha = orientation.alpha;
  const beta = orientation.beta;
  const gamma = orientation.gamma;
  // Read all inputs before writing any output (alias safety).
  const toRad = Math.PI / 180;
  const angle = screenAngle * toRad;
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  // Rotate gamma and beta components by the screen angle in the horizontal plane.
  out.alpha = alpha;
  out.beta = beta * cosA - gamma * sinA;
  out.gamma = beta * sinA + gamma * cosA;
  out.absolute = orientation.absolute;
  out.heading = orientation.heading;
  out.interval = orientation.interval;
  out.timestamp = orientation.timestamp;
  out.accuracy = orientation.accuracy;
}

// Rotates a device-frame acceleration vector (m/s²) into the world frame using a quaternion that
// describes the device's orientation. The quaternion represents the rotation from world to device
// frame; this function applies the inverse (device-to-world) rotation. Writes into `out`.
// Safe when `out` aliases `acceleration` because all inputs are read first.
export function computeWorldAccelerationFromDeviceAcceleration(
  out: MotionReading,
  acceleration: Readonly<MotionReading>,
  quaternion: Readonly<QuaternionReading>,
): void {
  // Read all inputs before writing any output (alias safety).
  const ax = acceleration.x;
  const ay = acceleration.y;
  const az = acceleration.z;
  const qx = quaternion.x;
  const qy = quaternion.y;
  const qz = quaternion.z;
  const qw = quaternion.w;
  // Apply the inverse (conjugate) quaternion rotation: q^-1 * v * q.
  // Using the efficient vector rotation formula: v' = v + 2*qw*(q × v) + 2*(q × (q × v)).
  const twx = 2 * qw;
  const cx = qy * az - qz * ay;
  const cy = qz * ax - qx * az;
  const cz = qx * ay - qy * ax;
  const ccx = qy * cz - qz * cy;
  const ccy = qz * cx - qx * cz;
  const ccz = qx * cy - qy * cx;
  out.x = ax + twx * cx + 2 * ccx;
  out.y = ay + twx * cy + 2 * ccy;
  out.z = az + twx * cz + 2 * ccz;
  out.interval = acceleration.interval;
  out.timestamp = acceleration.timestamp;
  out.accuracy = acceleration.accuracy;
}

// Allocates a zeroed AmbientLightReading with unknown accuracy/interval/timestamp.
export function createAmbientLightReading(): AmbientLightReading {
  return { accuracy: 'unknown', illuminance: 0, interval: -1, timestamp: -1 };
}

// Allocates a zeroed MotionReading with unknown accuracy/interval/timestamp.
// Used for accelerometer (gravity-included), linear acceleration, gravity vector, and magnetometer readings.
export function createMotionReading(): MotionReading {
  return { accuracy: 'unknown', interval: -1, timestamp: -1, x: 0, y: 0, z: 0 };
}

// Allocates a zeroed OrientationReading. heading is -1 (unknown) and absolute is false until
// a reading arrives.
export function createOrientationReading(): OrientationReading {
  return {
    absolute: false,
    accuracy: 'unknown',
    alpha: 0,
    beta: 0,
    gamma: 0,
    heading: -1,
    interval: -1,
    timestamp: -1,
  };
}

// Allocates a zeroed PressureReading with unknown accuracy/interval/timestamp.
// altitude is -1 when underivable from pressure alone.
export function createPressureReading(): PressureReading {
  return { accuracy: 'unknown', altitude: -1, interval: -1, pressure: 0, timestamp: -1 };
}

// Allocates a zeroed ProximityReading with unknown accuracy/interval/timestamp.
// distance and max are -1 when only near/far is known.
export function createProximityReading(): ProximityReading {
  return { accuracy: 'unknown', distance: -1, interval: -1, max: -1, near: false, timestamp: -1 };
}

// Allocates a zeroed QuaternionReading (identity quaternion: w=1) with unknown accuracy/interval/timestamp.
export function createQuaternionReading(): QuaternionReading {
  return { accuracy: 'unknown', interval: -1, timestamp: -1, w: 1, x: 0, y: 0, z: 0 };
}

// Allocates a zeroed RotationRateReading with unknown accuracy/interval/timestamp.
// alpha/beta/gamma are angular velocity in deg/s around the device z/x/y axes respectively.
export function createRotationRateReading(): RotationRateReading {
  return { accuracy: 'unknown', alpha: 0, beta: 0, gamma: 0, interval: -1, timestamp: -1 };
}

// Allocates a Sensors event entity with inert signals; call attachSensors to start delivery.
export function createSensors(): Sensors {
  return {
    onAbsoluteOrientation: createSignal(),
    onAccelerometer: createSignal(),
    onAmbientLight: createSignal(),
    onBarometer: createSignal(),
    onGravity: createSignal(),
    onGyroscope: createSignal(),
    onLinearAcceleration: createSignal(),
    onMagnetometer: createSignal(),
    onOrientation: createSignal(),
    onProximity: createSignal(),
    onQuaternion: createSignal(),
  };
}

// Builds the default web backend over the devicemotion, deviceorientation, and deviceorientationabsolute
// window events, plus the Generic Sensor API where available. Degrades to no-op subscriptions where
// window is absent and to a granted permission where the host does not gate sensors.
//
// Rate control: the Generic Sensor API honors the `frequency` option; the devicemotion /
// deviceorientation window event streams do not support rate control and always fire at the
// browser's default interval.
export function createWebSensorsBackend(): SensorsBackend {
  return {
    getPermissionState(sensor?: 'motion' | 'orientation' | 'magnetometer'): Promise<SensorsPermissionState> {
      return getWebSensorsPermissionState(sensor);
    },
    isAmbientLightSupported(): boolean {
      return getWebGenericSensorConstructor('AmbientLightSensor') !== null;
    },
    isBarometerSupported(): boolean {
      // The web platform has no standard Barometer API; always return false.
      return false;
    },
    isGravitySupported(): boolean {
      // Gravity is derived from devicemotion (accelerationIncludingGravity - acceleration).
      if (typeof window === 'undefined') return false;
      return typeof DeviceMotionEvent !== 'undefined';
    },
    isGyroscopeSupported(): boolean {
      if (typeof window === 'undefined') return false;
      return typeof DeviceMotionEvent !== 'undefined';
    },
    isLinearAccelerationSupported(): boolean {
      // Linear acceleration is the event.acceleration field of devicemotion.
      if (typeof window === 'undefined') return false;
      return typeof DeviceMotionEvent !== 'undefined';
    },
    isMagnetometerSupported(): boolean {
      return getWebMagnetometerConstructor() !== null;
    },
    isMotionSupported(): boolean {
      if (typeof window === 'undefined') return false;
      return typeof DeviceMotionEvent !== 'undefined';
    },
    isOrientationSupported(): boolean {
      if (typeof window === 'undefined') return false;
      return typeof DeviceOrientationEvent !== 'undefined';
    },
    isProximitySupported(): boolean {
      return false;
    },
    async requestPermission() {
      const request = getWebMotionPermissionRequest();
      if (request === null) return true;
      try {
        const state = await request();
        return state === 'granted';
      } catch {
        return false;
      }
    },
    subscribeAbsoluteOrientation(listener, options?: Readonly<SensorSubscribeOptions>) {
      if (typeof window === 'undefined') return () => {};
      // Try Generic Sensor AbsoluteOrientationSensor first.
      const ctor = getWebGenericSensorConstructor('AbsoluteOrientationSensor');
      if (ctor !== null) {
        try {
          const sensorOptions = options?.frequency !== undefined ? { frequency: options.frequency } : undefined;
          const sensor = new ctor(sensorOptions) as WebOrientationSensor;
          const handler = () => {
            const q = sensor.quaternion;
            if (q) {
              _quaternionReading.x = q[0] ?? 0;
              _quaternionReading.y = q[1] ?? 0;
              _quaternionReading.z = q[2] ?? 0;
              _quaternionReading.w = q[3] ?? 1;
              // Derive Euler orientation from the quaternion using ZXY convention.
              computeEulerFromQuaternion(_absoluteOrientation, _quaternionReading);
            }
            _absoluteOrientation.absolute = true;
            _absoluteOrientation.heading = -1;
            listener(_absoluteOrientation);
          };
          sensor.addEventListener('reading', handler);
          sensor.start();
          return () => {
            sensor.removeEventListener('reading', handler);
            sensor.stop();
          };
        } catch {
          // Fall through to event-based approach.
        }
      }
      // Fall back to deviceorientationabsolute event.
      const handler = (event: WebDeviceOrientationEvent) => {
        _absoluteOrientation.alpha = event.alpha ?? 0;
        _absoluteOrientation.beta = event.beta ?? 0;
        _absoluteOrientation.gamma = event.gamma ?? 0;
        _absoluteOrientation.absolute = true;
        _absoluteOrientation.heading = -1;
        _absoluteOrientation.interval = -1;
        _absoluteOrientation.timestamp = -1;
        listener(_absoluteOrientation);
      };
      window.addEventListener('deviceorientationabsolute', handler as EventListener);
      return () => {
        window.removeEventListener('deviceorientationabsolute', handler as EventListener);
      };
    },
    subscribeAmbientLight(listener, options?: Readonly<SensorSubscribeOptions>) {
      const ctor = getWebGenericSensorConstructor('AmbientLightSensor');
      if (ctor === null) return () => {};
      try {
        const sensorOptions = options?.frequency !== undefined ? { frequency: options.frequency } : undefined;
        const sensor = new ctor(sensorOptions) as WebAmbientLightSensor;
        const handler = () => {
          _ambientLight.illuminance = sensor.illuminance ?? 0;
          _ambientLight.interval = -1;
          _ambientLight.timestamp = -1;
          listener(_ambientLight);
        };
        sensor.addEventListener('reading', handler);
        sensor.start();
        return () => {
          sensor.removeEventListener('reading', handler);
          sensor.stop();
        };
      } catch {
        return () => {};
      }
    },
    subscribeBarometer(_listener, _options?: Readonly<SensorSubscribeOptions>) {
      // No barometer support on the web platform.
      return () => {};
    },
    subscribeGravity(listener, _options?: Readonly<SensorSubscribeOptions>) {
      if (typeof window === 'undefined') return () => {};
      // Derive gravity from the devicemotion event: gravity = accelerationIncludingGravity - acceleration.
      // When acceleration (gravity-removed) is unavailable, we cannot derive gravity.
      const handler = (event: WebDeviceMotionEvent) => {
        const withGravity = event.accelerationIncludingGravity;
        const linearAccel = event.acceleration;
        if (!withGravity) return;
        _gravity.x = (withGravity.x ?? 0) - (linearAccel?.x ?? 0);
        _gravity.y = (withGravity.y ?? 0) - (linearAccel?.y ?? 0);
        _gravity.z = (withGravity.z ?? 0) - (linearAccel?.z ?? 0);
        _gravity.interval = event.interval ?? -1;
        _gravity.timestamp = -1;
        listener(_gravity);
      };
      window.addEventListener('devicemotion', handler as EventListener);
      return () => {
        window.removeEventListener('devicemotion', handler as EventListener);
      };
    },
    subscribeLinearAcceleration(listener, _options?: Readonly<SensorSubscribeOptions>) {
      if (typeof window === 'undefined') return () => {};
      // event.acceleration is the gravity-removed linear acceleration vector.
      const handler = (event: WebDeviceMotionEvent) => {
        const accel = event.acceleration;
        if (!accel) return;
        _linearAcceleration.x = accel.x ?? 0;
        _linearAcceleration.y = accel.y ?? 0;
        _linearAcceleration.z = accel.z ?? 0;
        _linearAcceleration.interval = event.interval ?? -1;
        _linearAcceleration.timestamp = -1;
        listener(_linearAcceleration);
      };
      window.addEventListener('devicemotion', handler as EventListener);
      return () => {
        window.removeEventListener('devicemotion', handler as EventListener);
      };
    },
    subscribeMagnetometer(listener, options?: Readonly<SensorSubscribeOptions>) {
      const ctor = getWebMagnetometerConstructor();
      if (ctor === null) return () => {};
      try {
        const sensorOptions = options?.frequency !== undefined ? { frequency: options.frequency } : undefined;
        const sensor = new ctor(sensorOptions);
        const handler = () => {
          _magnetometer.x = sensor.x ?? 0;
          _magnetometer.y = sensor.y ?? 0;
          _magnetometer.z = sensor.z ?? 0;
          _magnetometer.interval = -1;
          _magnetometer.timestamp = -1;
          listener(_magnetometer);
        };
        sensor.addEventListener('reading', handler);
        sensor.start();
        return () => {
          sensor.removeEventListener('reading', handler);
          sensor.stop();
        };
      } catch {
        return () => {};
      }
    },
    subscribeMotion(listener, _options?: Readonly<SensorSubscribeOptions>) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: WebDeviceMotionEvent) => {
        const accel = event.accelerationIncludingGravity;
        _motionAcceleration.x = accel?.x ?? 0;
        _motionAcceleration.y = accel?.y ?? 0;
        _motionAcceleration.z = accel?.z ?? 0;
        _motionAcceleration.interval = event.interval ?? -1;
        _motionAcceleration.timestamp = -1;
        const rate = event.rotationRate;
        _motionRotationRate.alpha = rate?.alpha ?? 0;
        _motionRotationRate.beta = rate?.beta ?? 0;
        _motionRotationRate.gamma = rate?.gamma ?? 0;
        _motionRotationRate.interval = event.interval ?? -1;
        _motionRotationRate.timestamp = -1;
        listener(_motionAcceleration, _motionRotationRate);
      };
      window.addEventListener('devicemotion', handler as EventListener);
      return () => {
        window.removeEventListener('devicemotion', handler as EventListener);
      };
    },
    subscribeOrientation(listener, _options?: Readonly<SensorSubscribeOptions>) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: WebDeviceOrientationEvent) => {
        _orientation.alpha = event.alpha ?? 0;
        _orientation.beta = event.beta ?? 0;
        _orientation.gamma = event.gamma ?? 0;
        _orientation.absolute = event.absolute ?? false;
        _orientation.interval = -1;
        _orientation.timestamp = -1;
        // webkitCompassHeading is iOS-only; elsewhere the web exposes no compass heading, so report -1.
        const heading = (event as { webkitCompassHeading?: number }).webkitCompassHeading;
        _orientation.heading = typeof heading === 'number' ? heading : -1;
        listener(_orientation);
      };
      window.addEventListener('deviceorientation', handler as EventListener);
      return () => {
        window.removeEventListener('deviceorientation', handler as EventListener);
      };
    },
    subscribeProximity(_listener, _options?: Readonly<SensorSubscribeOptions>) {
      // No proximity sensor support on the standard web platform.
      return () => {};
    },
    subscribeQuaternion(listener, options?: Readonly<SensorSubscribeOptions>) {
      const ctor = getWebGenericSensorConstructor('AbsoluteOrientationSensor');
      if (ctor === null) return () => {};
      try {
        const sensorOptions = options?.frequency !== undefined ? { frequency: options.frequency } : undefined;
        const sensor = new ctor(sensorOptions) as WebOrientationSensor;
        const handler = () => {
          const q = sensor.quaternion;
          _quaternionReading.x = q?.[0] ?? 0;
          _quaternionReading.y = q?.[1] ?? 0;
          _quaternionReading.z = q?.[2] ?? 0;
          _quaternionReading.w = q?.[3] ?? 1;
          _quaternionReading.interval = -1;
          _quaternionReading.timestamp = -1;
          listener(_quaternionReading);
        };
        sensor.addEventListener('reading', handler);
        sensor.start();
        return () => {
          sensor.removeEventListener('reading', handler);
          sensor.stop();
        };
      } catch {
        return () => {};
      }
    },
  };
}

// Stops delivery to `sensors` and forgets its subscription. Safe to call when not attached.
export function detachSensors(sensors: Sensors): void {
  const unsubscribe = _subscriptions.get(sensors);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(sensors);
  }
}

// Releases `sensors` for garbage collection by detaching its backend subscriptions. The signals
// remain plain GC-managed memory afterward.
export function disposeSensors(sensors: Sensors): void {
  detachSensors(sensors);
}

// The active sensors backend, or a lazily-created web default. There is always a backend.
export function getSensorsBackend(): SensorsBackend {
  if (_backend === null) _backend = createWebSensorsBackend();
  return _backend;
}

// Queries the current permission state for the given sensor without triggering a permission prompt.
// Returns 'unsupported' when the device has no such sensor.
export function getSensorsPermissionState(
  sensor?: 'motion' | 'orientation' | 'magnetometer',
): Promise<SensorsPermissionState> {
  return getSensorsBackend().getPermissionState(sensor);
}

// True if the accelerometer (including gravity) is available on this device.
export function hasAccelerometer(): boolean {
  return getSensorsBackend().isMotionSupported();
}

// True if ambient light sensing is available on this device/platform.
export function hasAmbientLightSensor(): boolean {
  return getSensorsBackend().isAmbientLightSupported();
}

// True if barometric pressure sensing is available.
export function hasBarometer(): boolean {
  return getSensorsBackend().isBarometerSupported();
}

// True if the gravity vector sensor (or derivation) is available on this device.
export function hasGravitySensor(): boolean {
  return getSensorsBackend().isGravitySupported();
}

// True if the gyroscope (rotation rate) sensor is available.
export function hasGyroscope(): boolean {
  return getSensorsBackend().isGyroscopeSupported();
}

// True if the linear acceleration (gravity-removed) sensor is available.
export function hasLinearAccelerationSensor(): boolean {
  return getSensorsBackend().isLinearAccelerationSupported();
}

// True if the magnetometer sensor is available.
export function hasMagnetometer(): boolean {
  return getSensorsBackend().isMagnetometerSupported();
}

// True if the device orientation sensor is available.
export function hasOrientationSensor(): boolean {
  return getSensorsBackend().isOrientationSupported();
}

// True if a proximity sensor is available.
export function hasProximitySensor(): boolean {
  return getSensorsBackend().isProximitySupported();
}

// True if any motion sensors (accelerometer or gyroscope) are available on this device.
export function isSensorsSupported(): boolean {
  return getSensorsBackend().isMotionSupported();
}

// Requests sensor permission where the host gates it (iOS); resolves true when granted or ungated.
export function requestSensorsPermission(): Promise<boolean> {
  return getSensorsBackend().requestPermission();
}

// Installs a native host sensors backend; pass null to fall back to the web default.
export function setSensorsBackend(backend: SensorsBackend | null): void {
  _backend = backend;
}

let _backend: SensorsBackend | null = null;
const _absoluteOrientation: OrientationReading = createOrientationReading();
const _ambientLight: AmbientLightReading = createAmbientLightReading();
const _gravity: MotionReading = createMotionReading();
const _linearAcceleration: MotionReading = createMotionReading();
const _magnetometer: MotionReading = createMotionReading();
const _motionAcceleration: MotionReading = createMotionReading();
const _motionRotationRate: RotationRateReading = createRotationRateReading();
const _orientation: OrientationReading = createOrientationReading();
const _quaternionReading: QuaternionReading = createQuaternionReading();
const _subscriptions = new WeakMap<Sensors, () => void>();

interface WebMotionVector {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}

interface WebRotationRate {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
}

interface WebDeviceMotionEvent {
  acceleration?: WebMotionVector | null;
  accelerationIncludingGravity?: WebMotionVector | null;
  interval?: number | null;
  rotationRate?: WebRotationRate | null;
}

interface WebDeviceOrientationEvent {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  absolute?: boolean;
}

interface WebGenericSensor {
  addEventListener(type: 'reading', listener: () => void): void;
  removeEventListener(type: 'reading', listener: () => void): void;
  start(): void;
  stop(): void;
}

interface WebMagnetometer extends WebGenericSensor {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}

interface WebAmbientLightSensor extends WebGenericSensor {
  illuminance?: number | null;
}

interface WebOrientationSensor extends WebGenericSensor {
  quaternion?: readonly [number, number, number, number] | null;
}

// The Generic Sensor API Magnetometer constructor where the host exposes it, or null.
function getWebMagnetometerConstructor(): (new (options?: { frequency?: number }) => WebMagnetometer) | null {
  if (typeof Magnetometer === 'undefined') return null;
  return Magnetometer as unknown as new (options?: { frequency?: number }) => WebMagnetometer;
}

// A named Generic Sensor API constructor by class name, or null when unavailable.
function getWebGenericSensorConstructor(
  name: string,
): (new (options?: { frequency?: number }) => WebGenericSensor) | null {
  try {
    const ctor = (globalThis as Record<string, unknown>)[name];
    if (typeof ctor !== 'function') return null;
    return ctor as new (options?: { frequency?: number }) => WebGenericSensor;
  } catch {
    return null;
  }
}

async function getWebSensorsPermissionState(
  sensor?: 'motion' | 'orientation' | 'magnetometer',
): Promise<SensorsPermissionState> {
  if (typeof window === 'undefined') return 'unsupported';

  // Map our sensor names to W3C Permissions API names.
  const permissionName =
    sensor === 'magnetometer' ? 'magnetometer' : sensor === 'orientation' ? 'gyroscope' : 'accelerometer';

  if (typeof navigator !== 'undefined' && navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: permissionName as PermissionName });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      return 'prompt';
    } catch {
      // Permissions API not available or permission name not recognized.
    }
  }

  // iOS / browsers without Permissions API: check if DeviceMotionEvent requires requestPermission.
  if (sensor !== 'magnetometer' && sensor !== 'orientation') {
    const hasMotion = typeof DeviceMotionEvent !== 'undefined';
    if (!hasMotion) return 'unsupported';
  }

  // Cannot determine state without prompting; assume 'granted' for ungated platforms.
  return 'granted';
}

function getWebMotionPermissionRequest(): (() => Promise<string>) | null {
  if (typeof DeviceMotionEvent === 'undefined') return null;
  const ctor = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission !== 'function') return null;
  return () => ctor.requestPermission!();
}

// Prevent TypeScript from complaining about Magnetometer not being in lib.dom.
declare const Magnetometer: unknown;
declare const DeviceOrientationEvent: unknown;
