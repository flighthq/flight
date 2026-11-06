// Generated from crates/flight-sensors/src/sensors.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  allocateEntity,
  attachEntityBinding,
  detachEntityBinding,
  finishEntity,
  getEntityBindingAs,
} from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import { DEG_TO_RAD, RAD_TO_DEG } from '@flighthq/math/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';

import type {
  AmbientLightReading,
  HostSensorsCapability,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  Sensors,
  SensorsPermissionState,
} from './contract.sensors-types.ts';

/**
 * Exact releases held by one attached Sensors entity. The field order follows unsubscribe order.
 */
interface SensorsSubscription {
  absoluteOrientation: () => void;
  ambientLight: () => void;
  barometer: () => void;
  gravity: () => void;
  linearAcceleration: () => void;
  magnetometer: () => void;
  motion: () => void;
  orientation: () => void;
  proximity: () => void;
  quaternion: () => void;
}

/**
 * Subscribes all ten provider streams in source order. Reattaching first consumes the prior exact
 * release bundle. Readings are emitted by reference, so provider scratch identity is preserved.
 */
export function attachSensors(hostSensors: Readonly<HostSensorsCapability>, sensors: Sensors): void {
  detachSensors(sensors);
  const onAccelerometer = sensors.onAccelerometer;
  const onGyroscope = sensors.onGyroscope;
  const motion = hostSensors.subscribeMotion(
    (acceleration: Readonly<MotionReading>, rotationRate: Readonly<RotationRateReading>) => {
      emitSignal(onAccelerometer, acceleration);
      emitSignal(onGyroscope, rotationRate);
    },
    undefined,
  );
  const onLinearAcceleration = sensors.onLinearAcceleration;
  const linearAcceleration = hostSensors.subscribeLinearAcceleration((reading: Readonly<MotionReading>) => {
    emitSignal(onLinearAcceleration, reading);
  }, undefined);
  const onGravity = sensors.onGravity;
  const gravity = hostSensors.subscribeGravity(
    (reading: Readonly<MotionReading>) => emitSignal(onGravity, reading),
    undefined,
  );
  const onOrientation = sensors.onOrientation;
  const orientation = hostSensors.subscribeOrientation((reading: Readonly<OrientationReading>) => {
    emitSignal(onOrientation, reading);
  }, undefined);
  const onAbsoluteOrientation = sensors.onAbsoluteOrientation;
  const absoluteOrientation = hostSensors.subscribeAbsoluteOrientation((reading: Readonly<OrientationReading>) => {
    emitSignal(onAbsoluteOrientation, reading);
  }, undefined);
  const onMagnetometer = sensors.onMagnetometer;
  const magnetometer = hostSensors.subscribeMagnetometer(
    (reading: Readonly<MotionReading>) => emitSignal(onMagnetometer, reading),
    undefined,
  );
  const onAmbientLight = sensors.onAmbientLight;
  const ambientLight = hostSensors.subscribeAmbientLight((reading: Readonly<AmbientLightReading>) => {
    emitSignal(onAmbientLight, reading);
  }, undefined);
  const onBarometer = sensors.onBarometer;
  const barometer = hostSensors.subscribeBarometer(
    (reading: Readonly<PressureReading>) => emitSignal(onBarometer, reading),
    undefined,
  );
  const onProximity = sensors.onProximity;
  const proximity = hostSensors.subscribeProximity(
    (reading: Readonly<ProximityReading>) => emitSignal(onProximity, reading),
    undefined,
  );
  const onQuaternion = sensors.onQuaternion;
  const quaternion = hostSensors.subscribeQuaternion(
    (reading: Readonly<QuaternionReading>) => emitSignal(onQuaternion, reading),
    undefined,
  );
  attachEntityBinding(sensors, {
    absoluteOrientation,
    ambientLight,
    barometer,
    gravity,
    linearAcceleration,
    magnetometer,
    motion,
    orientation,
    proximity,
    quaternion,
  });
}

/**
 * Extracts ZXY Euler angles in degrees and propagates interval, timestamp and accuracy.
 */
export function computeEulerFromQuaternion(out: OrientationReading, quaternion: Readonly<QuaternionReading>): void {
  const x = quaternion.x;
  const y = quaternion.y;
  const z = quaternion.z;
  const w = quaternion.w;
  const interval = quaternion.interval;
  const timestamp = quaternion.timestamp;
  const accuracy = quaternion.accuracy;
  const sinBeta = 2 * (w * x - y * z);
  const beta = Math.abs(sinBeta) >= 1 ? Math.sign(sinBeta) * (Math.PI / 2) : Math.asin(sinBeta);
  const alpha = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
  const gamma = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
  out.alpha = (((alpha * RAD_TO_DEG) % 360) + 360) % 360;
  out.beta = beta * RAD_TO_DEG;
  out.gamma = gamma * RAD_TO_DEG;
  out.interval = interval;
  out.timestamp = timestamp;
  out.accuracy = accuracy;
}

/**
 * Computes the device-frame projection of standard gravity and propagates reading metadata.
 */
export function computeGravityFromOrientation(out: MotionReading, orientation: Readonly<OrientationReading>): void {
  const beta = orientation.beta * DEG_TO_RAD;
  const gamma = orientation.gamma * DEG_TO_RAD;
  const interval = orientation.interval;
  const timestamp = orientation.timestamp;
  const accuracy = orientation.accuracy;
  const sinGamma = Math.sin(gamma);
  const cosGamma = Math.cos(gamma);
  const sinBeta = Math.sin(beta);
  const cosBeta = Math.cos(beta);
  const STANDARD_GRAVITY = 9.80665;
  out.x = STANDARD_GRAVITY * cosBeta * sinGamma;
  out.y = -STANDARD_GRAVITY * sinBeta;
  out.z = STANDARD_GRAVITY * cosBeta * cosGamma;
  out.interval = interval;
  out.timestamp = timestamp;
  out.accuracy = accuracy;
}

/**
 * Computes a ZXY quaternion from Euler angles and propagates reading metadata.
 */
export function computeQuaternionFromOrientationReading(
  out: QuaternionReading,
  orientation: Readonly<OrientationReading>,
): void {
  const alpha = orientation.alpha * DEG_TO_RAD * 0.5;
  const beta = orientation.beta * DEG_TO_RAD * 0.5;
  const gamma = orientation.gamma * DEG_TO_RAD * 0.5;
  const interval = orientation.interval;
  const timestamp = orientation.timestamp;
  const accuracy = orientation.accuracy;
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);
  const cosBeta = Math.cos(beta);
  const sinBeta = Math.sin(beta);
  const cosGamma = Math.cos(gamma);
  const sinGamma = Math.sin(gamma);
  out.x = sinAlpha * sinBeta * cosGamma - cosAlpha * cosBeta * sinGamma;
  out.y = sinAlpha * cosBeta * sinGamma + cosAlpha * sinBeta * cosGamma;
  out.z = cosAlpha * cosBeta * sinGamma - sinAlpha * sinBeta * cosGamma;
  out.w = cosAlpha * cosBeta * cosGamma + sinAlpha * sinBeta * sinGamma;
  out.interval = interval;
  out.timestamp = timestamp;
  out.accuracy = accuracy;
}

/**
 * Writes a column-major 3x3 rotation matrix. A short source `number[]` grows to nine entries.
 */
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
  if (out.length < 9) {
    while (out.length < 9) {
      out.push(0);
    }
    out.length = 9;
  }
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

/**
 * Rotates beta and gamma into screen coordinates and propagates every other source field.
 */
export function computeScreenRelativeOrientation(
  out: OrientationReading,
  orientation: Readonly<OrientationReading>,
  screenAngle: number,
): void {
  const alpha = orientation.alpha;
  const beta = orientation.beta;
  const gamma = orientation.gamma;
  const absolute = orientation.absolute;
  const heading = orientation.heading;
  const interval = orientation.interval;
  const timestamp = orientation.timestamp;
  const accuracy = orientation.accuracy;
  const angle = screenAngle * DEG_TO_RAD;
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);
  out.alpha = alpha;
  out.beta = beta * cosAngle - gamma * sinAngle;
  out.gamma = beta * sinAngle + gamma * cosAngle;
  out.absolute = absolute;
  out.heading = heading;
  out.interval = interval;
  out.timestamp = timestamp;
  out.accuracy = accuracy;
}

/**
 * Applies the source quaternion vector-rotation formula and propagates acceleration metadata.
 */
export function computeWorldAccelerationFromDeviceAcceleration(
  out: MotionReading,
  acceleration: Readonly<MotionReading>,
  quaternion: Readonly<QuaternionReading>,
): void {
  const accelerationX = acceleration.x;
  const accelerationY = acceleration.y;
  const accelerationZ = acceleration.z;
  const interval = acceleration.interval;
  const timestamp = acceleration.timestamp;
  const accuracy = acceleration.accuracy;
  const quaternionX = quaternion.x;
  const quaternionY = quaternion.y;
  const quaternionZ = quaternion.z;
  const quaternionW = quaternion.w;
  const twiceW = 2 * quaternionW;
  const crossX = quaternionY * accelerationZ - quaternionZ * accelerationY;
  const crossY = quaternionZ * accelerationX - quaternionX * accelerationZ;
  const crossZ = quaternionX * accelerationY - quaternionY * accelerationX;
  const crossCrossX = quaternionY * crossZ - quaternionZ * crossY;
  const crossCrossY = quaternionZ * crossX - quaternionX * crossZ;
  const crossCrossZ = quaternionX * crossY - quaternionY * crossX;
  out.x = accelerationX + twiceW * crossX + 2 * crossCrossX;
  out.y = accelerationY + twiceW * crossY + 2 * crossCrossY;
  out.z = accelerationZ + twiceW * crossZ + 2 * crossCrossZ;
  out.interval = interval;
  out.timestamp = timestamp;
  out.accuracy = accuracy;
}

/**
 * Allocates an ambient-light reading with source sentinel values.
 */
export function createAmbientLightReading(): AmbientLightReading {
  let out: AmbientLightReading = allocateEntity<AmbientLightReading>();
  initializeAmbientLightReading(out);
  return finishEntity(out);
}

/**
 * Allocates a three-axis reading with source sentinel values.
 */
export function createMotionReading(): MotionReading {
  let out: MotionReading = allocateEntity<MotionReading>();
  initializeMotionReading(out);
  return finishEntity(out);
}

/**
 * Allocates an Euler-orientation reading with source sentinel values.
 */
export function createOrientationReading(): OrientationReading {
  let out: OrientationReading = allocateEntity<OrientationReading>();
  initializeOrientationReading(out);
  return finishEntity(out);
}

/**
 * Allocates a pressure reading with source sentinel values.
 */
export function createPressureReading(): PressureReading {
  let out: PressureReading = allocateEntity<PressureReading>();
  initializePressureReading(out);
  return finishEntity(out);
}

/**
 * Allocates a proximity reading with source sentinel values.
 */
export function createProximityReading(): ProximityReading {
  let out: ProximityReading = allocateEntity<ProximityReading>();
  initializeProximityReading(out);
  return finishEntity(out);
}

/**
 * Allocates an identity quaternion reading with source sentinel metadata.
 */
export function createQuaternionReading(): QuaternionReading {
  let out: QuaternionReading = allocateEntity<QuaternionReading>();
  initializeQuaternionReading(out);
  return finishEntity(out);
}

/**
 * Allocates an angular-velocity reading with source sentinel values.
 */
export function createRotationRateReading(): RotationRateReading {
  let out: RotationRateReading = allocateEntity<RotationRateReading>();
  initializeRotationRateReading(out);
  return finishEntity(out);
}

/**
 * Allocates an inert sensor event entity. Attach a host to begin delivery.
 */
export function createSensors(): Sensors {
  let out: Sensors = allocateEntity<Sensors>();
  initializeSensors(out);
  return finishEntity(out);
}

/**
 * Invokes the attached releases in the source's exact order, stopping on the first throw. The
 * binding is forgotten only after every release returns, so a thrown release remains retryable.
 */
export function detachSensors(sensors: Sensors): void {
  let subscription: SensorsSubscription | undefined = getEntityBindingAs(sensors) ?? undefined;
  if (subscription === undefined) {
    return;
  }
  subscription.absoluteOrientation();
  subscription.ambientLight();
  subscription.barometer();
  subscription.gravity();
  subscription.linearAcceleration();
  subscription.magnetometer();
  subscription.motion();
  subscription.orientation();
  subscription.proximity();
  subscription.quaternion();
  detachEntityBinding(sensors);
}

/**
 * Releases the provider subscriptions while leaving the signals as ordinary managed memory.
 */
export function disposeSensors(sensors: Sensors): void {
  detachSensors(sensors);
}

/**
 * Queries a permission state without prompting and preserves provider rejection unchanged.
 */
export async function getSensorsPermissionState(
  hostSensors: Readonly<HostSensorsCapability>,
  sensor?: 'motion' | 'orientation' | 'magnetometer',
): Promise<SensorsPermissionState> {
  return await hostSensors.getPermissionState(sensor);
}

/**
 * True when the combined accelerometer/motion stream is available.
 */
export function hasAccelerometer(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isMotionSupported();
}

/**
 * True when ambient light sensing is available.
 */
export function hasAmbientLightSensor(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isAmbientLightSupported();
}

/**
 * True when barometric pressure sensing is available.
 */
export function hasBarometer(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isBarometerSupported();
}

/**
 * True when a gravity vector stream is available.
 */
export function hasGravitySensor(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isGravitySupported();
}

/**
 * True when a rotation-rate stream is available.
 */
export function hasGyroscope(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isGyroscopeSupported();
}

/**
 * True when a gravity-removed acceleration stream is available.
 */
export function hasLinearAccelerationSensor(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isLinearAccelerationSupported();
}

/**
 * True when a magnetometer stream is available.
 */
export function hasMagnetometer(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isMagnetometerSupported();
}

/**
 * True when an Euler-orientation stream is available.
 */
export function hasOrientationSensor(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isOrientationSupported();
}

/**
 * True when a proximity stream is available.
 */
export function hasProximitySensor(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isProximitySupported();
}

/**
 * Initializes an ambient-light reading to zero with unknown metadata.
 */
export function initializeAmbientLightReading(out: EntityConstruction<AmbientLightReading>): void {
  out.accuracy = 'unknown';
  out.illuminance = 0;
  out.interval = -1;
  out.timestamp = -1;
}

/**
 * Initializes a three-axis reading to zero with unknown metadata.
 */
export function initializeMotionReading(out: EntityConstruction<MotionReading>): void {
  out.accuracy = 'unknown';
  out.interval = -1;
  out.timestamp = -1;
  out.x = 0;
  out.y = 0;
  out.z = 0;
}

/**
 * Initializes an Euler reading to a relative zero rotation with unknown heading and metadata.
 */
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

/**
 * Initializes a pressure reading with zero pressure and unknown altitude and metadata.
 */
export function initializePressureReading(out: EntityConstruction<PressureReading>): void {
  out.accuracy = 'unknown';
  out.altitude = -1;
  out.interval = -1;
  out.pressure = 0;
  out.timestamp = -1;
}

/**
 * Initializes a proximity reading with a far state and unknown distances and metadata.
 */
export function initializeProximityReading(out: EntityConstruction<ProximityReading>): void {
  out.accuracy = 'unknown';
  out.distance = -1;
  out.interval = -1;
  out.max = -1;
  out.near = false;
  out.timestamp = -1;
}

/**
 * Initializes a quaternion reading to identity with unknown metadata.
 */
export function initializeQuaternionReading(out: EntityConstruction<QuaternionReading>): void {
  out.accuracy = 'unknown';
  out.interval = -1;
  out.timestamp = -1;
  out.w = 1;
  out.x = 0;
  out.y = 0;
  out.z = 0;
}

/**
 * Initializes an angular-velocity reading to zero with unknown metadata.
 */
export function initializeRotationRateReading(out: EntityConstruction<RotationRateReading>): void {
  out.accuracy = 'unknown';
  out.alpha = 0;
  out.beta = 0;
  out.gamma = 0;
  out.interval = -1;
  out.timestamp = -1;
}

/**
 * Gives a Sensors entity eleven fresh inert signals and no provider binding.
 */
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
  detachEntityBinding(out);
}

/**
 * True when either member of the combined motion stream is available.
 */
export function isSensorsSupported(hostSensors: Readonly<HostSensorsCapability>): boolean {
  return hostSensors.isMotionSupported();
}

/**
 * Requests gated sensor permission and preserves provider rejection unchanged.
 */
export async function requestSensorsPermission(hostSensors: Readonly<HostSensorsCapability>): Promise<boolean> {
  return await hostSensors.requestPermission();
}
