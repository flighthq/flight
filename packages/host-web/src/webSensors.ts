import {
  computeEulerFromQuaternion,
  createAmbientLightReading,
  createMotionReading,
  createOrientationReading,
  createQuaternionReading,
  createRotationRateReading,
} from '@flighthq/sensors/contract';
import type {
  AmbientLightReading,
  HostSensorsCapability,
  MotionReading,
  OrientationReading,
  QuaternionReading,
  RotationRateReading,
  SensorsPermissionState,
  SensorSubscribeOptions,
} from '@flighthq/types/contract';

// Builds the default Web provider over the devicemotion, deviceorientation, and deviceorientationabsolute
// window events, plus the Generic Sensor API where available. Degrades to no-op subscriptions where
// window is absent and to a granted permission where the host does not gate sensors.
//
// Rate control: the Generic Sensor API honors the `frequency` option; the devicemotion /
// deviceorientation window event streams do not support rate control and always fire at the
// browser's default interval.
function createWebSensorsBackend(): HostSensorsCapability {
  // Explicit type argument so the literal keeps its contextual method parameter types — without one,
  // inference from the return annotation drops them to implicit `any`. The argument is the shape MINUS
  // the runtime slot: `allocateEntity<HostSensorsCapability>` cannot work, because allocateEntity's type parameter
  // IS its parameter type, so naming the finished type would demand the slot it exists to add.
  const out = {} as HostSensorsCapability;
  out.getPermissionState = (sensor?: 'motion' | 'orientation' | 'magnetometer'): Promise<SensorsPermissionState> => {
    return getWebSensorsPermissionState(sensor);
  };
  out.isAmbientLightSupported = (): boolean => {
    return getWebGenericSensorConstructor('AmbientLightSensor') !== null;
  };
  out.isBarometerSupported = (): boolean => {
    // The web platform has no standard Barometer API; always return false.
    return false;
  };
  out.isGravitySupported = (): boolean => {
    // Gravity is derived from devicemotion (accelerationIncludingGravity - acceleration).
    if (typeof window === 'undefined') return false;
    return typeof DeviceMotionEvent !== 'undefined';
  };
  out.isGyroscopeSupported = (): boolean => {
    if (typeof window === 'undefined') return false;
    return typeof DeviceMotionEvent !== 'undefined';
  };
  out.isLinearAccelerationSupported = (): boolean => {
    // Linear acceleration is the event.acceleration field of devicemotion.
    if (typeof window === 'undefined') return false;
    return typeof DeviceMotionEvent !== 'undefined';
  };
  out.isMagnetometerSupported = (): boolean => {
    return getWebMagnetometerConstructor() !== null;
  };
  out.isMotionSupported = (): boolean => {
    if (typeof window === 'undefined') return false;
    return typeof DeviceMotionEvent !== 'undefined';
  };
  out.isOrientationSupported = (): boolean => {
    if (typeof window === 'undefined') return false;
    return typeof DeviceOrientationEvent !== 'undefined';
  };
  out.isProximitySupported = (): boolean => {
    return false;
  };
  out.requestPermission = async () => {
    const request = getWebMotionPermissionRequest();
    if (request === null) return true;
    try {
      const state = await request();
      return state === 'granted';
    } catch {
      return false;
    }
  };
  out.subscribeAbsoluteOrientation = (listener, options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeAmbientLight = (listener, options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeBarometer = (_listener, _options?: Readonly<SensorSubscribeOptions>) => {
    // No barometer support on the web platform.
    return () => {};
  };
  out.subscribeGravity = (listener, _options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeLinearAcceleration = (listener, _options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeMagnetometer = (listener, options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeMotion = (listener, _options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeOrientation = (listener, _options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  out.subscribeProximity = (_listener, _options?: Readonly<SensorSubscribeOptions>) => {
    // No proximity sensor support on the standard web platform.
    return () => {};
  };
  out.subscribeQuaternion = (listener, options?: Readonly<SensorSubscribeOptions>) => {
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
  };
  return out;
}

// Published on the Host rather than installed into the sensors package, so a caller selects this
// provider by passing the host that carries it.
export const webHostSensors: HostSensorsCapability = createWebSensorsBackend();

const _absoluteOrientation: OrientationReading = createOrientationReading();
const _ambientLight: AmbientLightReading = createAmbientLightReading();
const _gravity: MotionReading = createMotionReading();
const _linearAcceleration: MotionReading = createMotionReading();
const _magnetometer: MotionReading = createMotionReading();
const _motionAcceleration: MotionReading = createMotionReading();
const _motionRotationRate: RotationRateReading = createRotationRateReading();
const _orientation: OrientationReading = createOrientationReading();
const _quaternionReading: QuaternionReading = createQuaternionReading();

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
  let permissionName = 'accelerometer';
  if (sensor === 'orientation') permissionName = 'gyroscope';
  else if (sensor === 'magnetometer') permissionName = 'magnetometer';

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
