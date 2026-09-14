import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { DEG_TO_RAD, RAD_TO_DEG } from '@flighthq/math/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { EntityConstruction } from '@flighthq/types/contract';
import type {
  AmbientLightReading,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  Sensors,
  HostSensorsProvider,
  SensorsPermissionState,
  SensorSubscribeOptions,
} from '@flighthq/types/contract';

// Begins delivering sensor readings to `sensors`'s signals by subscribing to the supplied provider's
// streams. Idempotent: a prior subscription is torn down first. Pair with detachSensors/disposeSensors.
//
// Readings passed to signal listeners are scratch-reused objects. Listeners must not retain a
// reference to a reading across callback boundaries — copy the values if they need to outlive the call.
export function attachSensors(hostSensors: Readonly<HostSensorsProvider>, sensors: Sensors): void {
  detachSensors(sensors);
  const backend = hostSensors;

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
  out.alpha = (((alpha * RAD_TO_DEG) % 360) + 360) % 360; // normalize to [0, 360)
  out.beta = beta * RAD_TO_DEG;
  out.gamma = gamma * RAD_TO_DEG;
  out.interval = quaternion.interval;
  out.timestamp = quaternion.timestamp;
  out.accuracy = quaternion.accuracy;
}

// Derives the gravity vector (m/s²) from Euler orientation angles (alpha/beta/gamma in degrees)
// into a MotionReading. The result is the device-frame projection of the 9.81 m/s² downward
// gravity vector onto each device axis. Writes into `out`.
// Safe when `out` aliases any field of `orientation` because all inputs are read first.
export function computeGravityFromOrientation(out: MotionReading, orientation: Readonly<OrientationReading>): void {
  const b = orientation.beta * DEG_TO_RAD;
  const g = orientation.gamma * DEG_TO_RAD;
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
  const a = orientation.alpha * DEG_TO_RAD * 0.5;
  const b = orientation.beta * DEG_TO_RAD * 0.5;
  const g = orientation.gamma * DEG_TO_RAD * 0.5;
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
  const angle = screenAngle * DEG_TO_RAD;
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

export function createAmbientLightReading(): AmbientLightReading {
  const out = allocateEntity<AmbientLightReading>();
  initializeAmbientLightReading(out);
  return finishEntity(out);
}

export function createMotionReading(): MotionReading {
  const out = allocateEntity<MotionReading>();
  initializeMotionReading(out);
  return finishEntity(out);
}

export function createOrientationReading(): OrientationReading {
  const out = allocateEntity<OrientationReading>();
  initializeOrientationReading(out);
  return finishEntity(out);
}

export function createPressureReading(): PressureReading {
  const out = allocateEntity<PressureReading>();
  initializePressureReading(out);
  return finishEntity(out);
}

export function createProximityReading(): ProximityReading {
  const out = allocateEntity<ProximityReading>();
  initializeProximityReading(out);
  return finishEntity(out);
}

export function createQuaternionReading(): QuaternionReading {
  const out = allocateEntity<QuaternionReading>();
  initializeQuaternionReading(out);
  return finishEntity(out);
}

export function createRotationRateReading(): RotationRateReading {
  const out = allocateEntity<RotationRateReading>();
  initializeRotationRateReading(out);
  return finishEntity(out);
}

export function createSensors(): Sensors {
  const out = allocateEntity<Sensors>();
  initializeSensors(out);
  return finishEntity(out);
}

// Stops delivery to `sensors` and forgets its subscription. Safe to call when not attached.
export function detachSensors(sensors: Sensors): void {
  const unsubscribe = _subscriptions.get(sensors);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(sensors);
  }
}

// Releases `sensors` for garbage collection by detaching its provider subscriptions. The signals
// remain plain GC-managed memory afterward.
export function disposeSensors(sensors: Sensors): void {
  detachSensors(sensors);
}

// Queries the current permission state for the given sensor without triggering a permission prompt.
// Returns 'unsupported' when the device has no such sensor.
export function getSensorsPermissionState(
  hostSensors: Readonly<HostSensorsProvider>,
  sensor?: 'motion' | 'orientation' | 'magnetometer',
): Promise<SensorsPermissionState> {
  return hostSensors.getPermissionState(sensor);
}

// True if the accelerometer (including gravity) is available on this device.
export function hasAccelerometer(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isMotionSupported();
}

// True if ambient light sensing is available on this device/platform.
export function hasAmbientLightSensor(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isAmbientLightSupported();
}

// True if barometric pressure sensing is available.
export function hasBarometer(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isBarometerSupported();
}

// True if the gravity vector sensor (or derivation) is available on this device.
export function hasGravitySensor(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isGravitySupported();
}

// True if the gyroscope (rotation rate) sensor is available.
export function hasGyroscope(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isGyroscopeSupported();
}

// True if the linear acceleration (gravity-removed) sensor is available.
export function hasLinearAccelerationSensor(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isLinearAccelerationSupported();
}

// True if the magnetometer sensor is available.
export function hasMagnetometer(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isMagnetometerSupported();
}

// True if the device orientation sensor is available.
export function hasOrientationSensor(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isOrientationSupported();
}

// True if a proximity sensor is available.
export function hasProximitySensor(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isProximitySupported();
}

// Allocates a zeroed AmbientLightReading with unknown accuracy/interval/timestamp.
export function initializeAmbientLightReading(out: EntityConstruction<AmbientLightReading>): void {
  out.accuracy = 'unknown';
  out.illuminance = 0;
  out.interval = -1;
  out.timestamp = -1;
}

// Allocates a zeroed MotionReading with unknown accuracy/interval/timestamp.
// Used for accelerometer (gravity-included), linear acceleration, gravity vector, and magnetometer readings.
export function initializeMotionReading(out: EntityConstruction<MotionReading>): void {
  out.accuracy = 'unknown';
  out.interval = -1;
  out.timestamp = -1;
  out.x = 0;
  out.y = 0;
  out.z = 0;
}

// Allocates a zeroed OrientationReading. heading is -1 (unknown) and absolute is false until
// a reading arrives.
export function initializeOrientationReading(out: EntityConstruction<OrientationReading>): void {
  out.absolute = false;
  out.accuracy = 'unknown';
  out.alpha = 0;
  out.beta = 0;
  out.gamma = 0;
  out.heading = -1;
  out.interval = -1;
  out.timestamp = -1;
}

// Allocates a zeroed PressureReading with unknown accuracy/interval/timestamp.
// altitude is -1 when underivable from pressure alone.
export function initializePressureReading(out: EntityConstruction<PressureReading>): void {
  out.accuracy = 'unknown';
  out.altitude = -1;
  out.interval = -1;
  out.pressure = 0;
  out.timestamp = -1;
}

// Allocates a zeroed ProximityReading with unknown accuracy/interval/timestamp.
// distance and max are -1 when only near/far is known.
export function initializeProximityReading(out: EntityConstruction<ProximityReading>): void {
  out.accuracy = 'unknown';
  out.distance = -1;
  out.interval = -1;
  out.max = -1;
  out.near = false;
  out.timestamp = -1;
}

// Allocates a zeroed QuaternionReading (identity quaternion: w=1) with unknown accuracy/interval/timestamp.
export function initializeQuaternionReading(out: EntityConstruction<QuaternionReading>): void {
  out.accuracy = 'unknown';
  out.interval = -1;
  out.timestamp = -1;
  out.w = 1;
  out.x = 0;
  out.y = 0;
  out.z = 0;
}

// Allocates a zeroed RotationRateReading with unknown accuracy/interval/timestamp.
// alpha/beta/gamma are angular velocity in deg/s around the device z/x/y axes respectively.
export function initializeRotationRateReading(out: EntityConstruction<RotationRateReading>): void {
  out.accuracy = 'unknown';
  out.alpha = 0;
  out.beta = 0;
  out.gamma = 0;
  out.interval = -1;
  out.timestamp = -1;
}

// Allocates a Sensors event entity with inert signals; call attachSensors to start delivery.
export function initializeSensors(out: EntityConstruction<Sensors>): void {
  out.onAbsoluteOrientation = createSignal();
  out.onAccelerometer = createSignal();
  out.onAmbientLight = createSignal();
  out.onBarometer = createSignal();
  out.onGravity = createSignal();
  out.onGyroscope = createSignal();
  out.onLinearAcceleration = createSignal();
  out.onMagnetometer = createSignal();
  out.onOrientation = createSignal();
  out.onProximity = createSignal();
  out.onQuaternion = createSignal();
}

// True if any motion sensors (accelerometer or gyroscope) are available on this device.
export function isSensorsSupported(hostSensors: Readonly<HostSensorsProvider>): boolean {
  return hostSensors.isMotionSupported();
}

// Requests sensor permission where the host gates it (iOS); resolves true when granted or ungated.
export function requestSensorsPermission(hostSensors: Readonly<HostSensorsProvider>): Promise<boolean> {
  return hostSensors.requestPermission();
}

const _subscriptions = new WeakMap<Sensors, () => void>();
