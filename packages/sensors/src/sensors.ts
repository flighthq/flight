import { createSignal, emitSignal } from '@flighthq/signals';
import type { MotionReading, OrientationReading, Sensors, SensorsBackend } from '@flighthq/types';

// Begins delivering sensor readings to `sensors`'s signals by subscribing to the active backend's
// motion and orientation streams. The motion listener emits onAccelerometer and onGyroscope; the
// orientation listener emits onOrientation. A single combined unsubscribe tears down both. Idempotent:
// a prior subscription is torn down first. Pair with detachSensors/disposeSensors.
export function attachSensors(sensors: Sensors): void {
  detachSensors(sensors);
  const backend = getSensorsBackend();
  const unsubscribeMotion = backend.subscribeMotion((acceleration, rotationRate) => {
    emitSignal(sensors.onAccelerometer, acceleration);
    emitSignal(sensors.onGyroscope, rotationRate);
  });
  const unsubscribeOrientation = backend.subscribeOrientation((orientation) => {
    emitSignal(sensors.onOrientation, orientation);
  });
  const unsubscribeMagnetometer = backend.subscribeMagnetometer((reading) => {
    emitSignal(sensors.onMagnetometer, reading);
  });
  _subscriptions.set(sensors, () => {
    unsubscribeMotion();
    unsubscribeOrientation();
    unsubscribeMagnetometer();
  });
}

// Allocates a zeroed MotionReading.
export function createMotionReading(): MotionReading {
  return { x: 0, y: 0, z: 0 };
}

// Allocates a zeroed OrientationReading. heading is -1 (unknown) and absolute is false until a reading arrives.
export function createOrientationReading(): OrientationReading {
  return { alpha: 0, beta: 0, gamma: 0, absolute: false, heading: -1 };
}

// Allocates a Sensors event entity with inert signals; call attachSensors to start delivery.
export function createSensors(): Sensors {
  return {
    onAccelerometer: createSignal(),
    onGyroscope: createSignal(),
    onMagnetometer: createSignal(),
    onOrientation: createSignal(),
  };
}

// Builds the default web backend over the devicemotion and deviceorientation window events. Degrades
// to no-op subscriptions where window is absent and to a granted permission where the host does not
// gate sensors.
export function createWebSensorsBackend(): SensorsBackend {
  return {
    subscribeMotion(listener) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: WebDeviceMotionEvent) => {
        const accel = event.accelerationIncludingGravity;
        _motionAcceleration.x = accel?.x ?? 0;
        _motionAcceleration.y = accel?.y ?? 0;
        _motionAcceleration.z = accel?.z ?? 0;
        const rate = event.rotationRate;
        _motionRotationRate.x = rate?.alpha ?? 0;
        _motionRotationRate.y = rate?.beta ?? 0;
        _motionRotationRate.z = rate?.gamma ?? 0;
        listener(_motionAcceleration, _motionRotationRate);
      };
      window.addEventListener('devicemotion', handler as EventListener);
      return () => {
        window.removeEventListener('devicemotion', handler as EventListener);
      };
    },
    subscribeOrientation(listener) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: WebDeviceOrientationEvent) => {
        _orientation.alpha = event.alpha ?? 0;
        _orientation.beta = event.beta ?? 0;
        _orientation.gamma = event.gamma ?? 0;
        _orientation.absolute = event.absolute ?? false;
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
    // Wraps the Generic Sensor API's Magnetometer where available; no-ops otherwise. A native host
    // supplies magnetometer readings through the same callback. Readings are x/y/z in microtesla.
    subscribeMagnetometer(listener) {
      const ctor = getWebMagnetometerConstructor();
      if (ctor === null) return () => {};
      try {
        const sensor = new ctor();
        const handler = () => {
          _magnetometer.x = sensor.x ?? 0;
          _magnetometer.y = sensor.y ?? 0;
          _magnetometer.z = sensor.z ?? 0;
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

// Requests sensor permission where the host gates it (iOS); resolves true when granted or ungated.
export function requestSensorsPermission(): Promise<boolean> {
  return getSensorsBackend().requestPermission();
}

// Installs a native host sensors backend; pass null to fall back to the web default.
export function setSensorsBackend(backend: SensorsBackend | null): void {
  _backend = backend;
}

let _backend: SensorsBackend | null = null;
const _magnetometer: MotionReading = createMotionReading();
const _motionAcceleration: MotionReading = createMotionReading();
const _motionRotationRate: MotionReading = createMotionReading();
const _orientation: OrientationReading = createOrientationReading();
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
  accelerationIncludingGravity?: WebMotionVector | null;
  rotationRate?: WebRotationRate | null;
}

interface WebDeviceOrientationEvent {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  absolute?: boolean;
}

interface WebMagnetometer {
  x?: number | null;
  y?: number | null;
  z?: number | null;
  addEventListener(type: 'reading', listener: () => void): void;
  removeEventListener(type: 'reading', listener: () => void): void;
  start(): void;
  stop(): void;
}

// The Generic Sensor API Magnetometer constructor where the host exposes it, or null. Native required elsewhere.
function getWebMagnetometerConstructor(): (new () => WebMagnetometer) | null {
  if (typeof Magnetometer === 'undefined') return null;
  return Magnetometer as unknown as new () => WebMagnetometer;
}

function getWebMotionPermissionRequest(): (() => Promise<string>) | null {
  if (typeof DeviceMotionEvent === 'undefined') return null;
  const ctor = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission !== 'function') return null;
  return () => ctor.requestPermission!();
}

declare const Magnetometer: unknown;
