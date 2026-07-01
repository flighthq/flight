import { connectSignal } from '@flighthq/signals';
import type {
  AmbientLightReading,
  MotionReading,
  OrientationReading,
  PressureReading,
  ProximityReading,
  QuaternionReading,
  RotationRateReading,
  SensorsBackend,
  SensorsPermissionState,
} from '@flighthq/types';

import {
  attachSensors,
  computeEulerFromQuaternion,
  computeGravityFromOrientation,
  computeQuaternionFromOrientationReading,
  computeRotationMatrixFromQuaternion,
  computeScreenRelativeOrientation,
  computeWorldAccelerationFromDeviceAcceleration,
  createAmbientLightReading,
  createMotionReading,
  createOrientationReading,
  createPressureReading,
  createProximityReading,
  createQuaternionReading,
  createRotationRateReading,
  createSensors,
  createWebSensorsBackend,
  detachSensors,
  disposeSensors,
  getSensorsBackend,
  getSensorsPermissionState,
  hasAccelerometer,
  hasAmbientLightSensor,
  hasBarometer,
  hasGravitySensor,
  hasGyroscope,
  hasLinearAccelerationSensor,
  hasMagnetometer,
  hasOrientationSensor,
  hasProximitySensor,
  isSensorsSupported,
  requestSensorsPermission,
  setSensorsBackend,
} from './sensors';

function fakeBackend(): SensorsBackend & {
  fireMotion: (acceleration: MotionReading, rotationRate: RotationRateReading) => void;
  fireOrientation: (orientation: OrientationReading) => void;
  fireMagnetometer: (reading: MotionReading) => void;
  fireLinearAcceleration: (reading: MotionReading) => void;
  fireGravity: (reading: MotionReading) => void;
  fireAbsoluteOrientation: (orientation: OrientationReading) => void;
  fireAmbientLight: (reading: AmbientLightReading) => void;
  fireBarometer: (reading: PressureReading) => void;
  fireProximity: (reading: ProximityReading) => void;
  fireQuaternion: (reading: QuaternionReading) => void;
} {
  let motionListener: ((a: Readonly<MotionReading>, r: Readonly<RotationRateReading>) => void) | null = null;
  let orientationListener: ((o: Readonly<OrientationReading>) => void) | null = null;
  let magnetometerListener: ((reading: Readonly<MotionReading>) => void) | null = null;
  let linearAccelerationListener: ((reading: Readonly<MotionReading>) => void) | null = null;
  let gravityListener: ((reading: Readonly<MotionReading>) => void) | null = null;
  let absoluteOrientationListener: ((orientation: Readonly<OrientationReading>) => void) | null = null;
  let ambientLightListener: ((reading: Readonly<AmbientLightReading>) => void) | null = null;
  let barometerListener: ((reading: Readonly<PressureReading>) => void) | null = null;
  let proximityListener: ((reading: Readonly<ProximityReading>) => void) | null = null;
  let quaternionListener: ((reading: Readonly<QuaternionReading>) => void) | null = null;

  return {
    getPermissionState: async (): Promise<SensorsPermissionState> => 'granted',
    isAmbientLightSupported: () => true,
    isBarometerSupported: () => false,
    isGravitySupported: () => true,
    isGyroscopeSupported: () => true,
    isLinearAccelerationSupported: () => true,
    isMagnetometerSupported: () => true,
    isMotionSupported: () => true,
    isOrientationSupported: () => true,
    isProximitySupported: () => false,
    requestPermission: async () => true,
    subscribeAbsoluteOrientation(l) {
      absoluteOrientationListener = l;
      return () => {
        absoluteOrientationListener = null;
      };
    },
    subscribeAmbientLight(l) {
      ambientLightListener = l;
      return () => {
        ambientLightListener = null;
      };
    },
    subscribeBarometer(l) {
      barometerListener = l;
      return () => {
        barometerListener = null;
      };
    },
    subscribeGravity(l) {
      gravityListener = l;
      return () => {
        gravityListener = null;
      };
    },
    subscribeLinearAcceleration(l) {
      linearAccelerationListener = l;
      return () => {
        linearAccelerationListener = null;
      };
    },
    subscribeMagnetometer(l) {
      magnetometerListener = l;
      return () => {
        magnetometerListener = null;
      };
    },
    subscribeMotion(l) {
      motionListener = l;
      return () => {
        motionListener = null;
      };
    },
    subscribeOrientation(l) {
      orientationListener = l;
      return () => {
        orientationListener = null;
      };
    },
    subscribeProximity(l) {
      proximityListener = l;
      return () => {
        proximityListener = null;
      };
    },
    subscribeQuaternion(l) {
      quaternionListener = l;
      return () => {
        quaternionListener = null;
      };
    },
    fireAbsoluteOrientation(orientation) {
      absoluteOrientationListener?.(orientation);
    },
    fireAmbientLight(reading) {
      ambientLightListener?.(reading);
    },
    fireBarometer(reading) {
      barometerListener?.(reading);
    },
    fireGravity(reading) {
      gravityListener?.(reading);
    },
    fireLinearAcceleration(reading) {
      linearAccelerationListener?.(reading);
    },
    fireMagnetometer(reading) {
      magnetometerListener?.(reading);
    },
    fireMotion(acceleration, rotationRate) {
      motionListener?.(acceleration, rotationRate);
    },
    fireOrientation(orientation) {
      orientationListener?.(orientation);
    },
    fireProximity(reading) {
      proximityListener?.(reading);
    },
    fireQuaternion(reading) {
      quaternionListener?.(reading);
    },
  };
}

afterEach(() => setSensorsBackend(null));

describe('attachSensors', () => {
  it('emits onAccelerometer and onGyroscope from the motion stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let accel = 0;
    let gyro = 0;
    connectSignal(sensors.onAccelerometer, () => accel++);
    connectSignal(sensors.onGyroscope, () => gyro++);
    attachSensors(sensors);
    backend.fireMotion(createMotionReading(), createRotationRateReading());
    expect(accel).toBe(1);
    expect(gyro).toBe(1);
  });

  it('emits onOrientation from the orientation stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let orient = 0;
    connectSignal(sensors.onOrientation, () => orient++);
    attachSensors(sensors);
    backend.fireOrientation(createOrientationReading());
    expect(orient).toBe(1);
  });

  it('emits onMagnetometer from the magnetometer stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let magnet = 0;
    connectSignal(sensors.onMagnetometer, () => magnet++);
    attachSensors(sensors);
    backend.fireMagnetometer(createMotionReading());
    expect(magnet).toBe(1);
  });

  it('emits onLinearAcceleration from the linear acceleration stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onLinearAcceleration, () => count++);
    attachSensors(sensors);
    backend.fireLinearAcceleration(createMotionReading());
    expect(count).toBe(1);
  });

  it('emits onGravity from the gravity stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onGravity, () => count++);
    attachSensors(sensors);
    backend.fireGravity(createMotionReading());
    expect(count).toBe(1);
  });

  it('emits onAbsoluteOrientation from the absolute orientation stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onAbsoluteOrientation, () => count++);
    attachSensors(sensors);
    backend.fireAbsoluteOrientation(createOrientationReading());
    expect(count).toBe(1);
  });

  it('emits onAmbientLight from the ambient light stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onAmbientLight, () => count++);
    attachSensors(sensors);
    backend.fireAmbientLight(createAmbientLightReading());
    expect(count).toBe(1);
  });

  it('emits onProximity from the proximity stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onProximity, () => count++);
    attachSensors(sensors);
    backend.fireProximity(createProximityReading());
    expect(count).toBe(1);
  });

  it('emits onQuaternion from the quaternion stream', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onQuaternion, () => count++);
    attachSensors(sensors);
    backend.fireQuaternion(createQuaternionReading());
    expect(count).toBe(1);
  });

  it('is idempotent: re-attach tears down the prior subscription', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let count = 0;
    connectSignal(sensors.onAccelerometer, () => count++);
    attachSensors(sensors);
    attachSensors(sensors);
    backend.fireMotion(createMotionReading(), createRotationRateReading());
    // Only one subscription should be active.
    expect(count).toBe(1);
  });
});

describe('computeEulerFromQuaternion', () => {
  it('converts an identity quaternion to zero Euler angles', () => {
    const q = createQuaternionReading();
    const out = createOrientationReading();
    computeEulerFromQuaternion(out, q);
    // Identity quaternion → zero rotation → alpha near 0, beta near 0, gamma near 0.
    expect(out.beta).toBeCloseTo(0, 5);
    expect(out.gamma).toBeCloseTo(0, 5);
  });

  it('propagates interval, timestamp, and accuracy from the quaternion', () => {
    const q = createQuaternionReading();
    q.interval = 20;
    q.timestamp = 99999;
    q.accuracy = 'high';
    const out = createOrientationReading();
    computeEulerFromQuaternion(out, q);
    expect(out.interval).toBe(20);
    expect(out.timestamp).toBe(99999);
    expect(out.accuracy).toBe('high');
  });

  it('is alias-safe when out is a separate object', () => {
    const q = createQuaternionReading();
    // 90-degree rotation around Z.
    const angle = Math.PI / 4;
    q.w = Math.cos(angle);
    q.z = Math.sin(angle);
    const out = createOrientationReading();
    computeEulerFromQuaternion(out, q);
    // alpha should reflect a ~90-degree rotation around Z.
    expect(out.alpha).toBeGreaterThan(80);
    expect(out.alpha).toBeLessThan(100);
  });
});

describe('computeGravityFromOrientation', () => {
  it('returns a near-zero gravity vector for zero orientation', () => {
    const orientation = createOrientationReading();
    const out = createMotionReading();
    computeGravityFromOrientation(out, orientation);
    // Device flat on table: gravity points in +Z (device frame), with ~9.8 m/s².
    expect(out.x).toBeCloseTo(0, 3);
    expect(out.y).toBeCloseTo(0, 3);
    expect(Math.abs(out.z)).toBeCloseTo(9.80665, 3);
  });

  it('propagates interval, timestamp, and accuracy from the orientation', () => {
    const orientation = createOrientationReading();
    orientation.interval = 10;
    orientation.timestamp = 5000;
    orientation.accuracy = 'medium';
    const out = createMotionReading();
    computeGravityFromOrientation(out, orientation);
    expect(out.interval).toBe(10);
    expect(out.timestamp).toBe(5000);
    expect(out.accuracy).toBe('medium');
  });

  it('is alias-safe: does not corrupt the input when out differs', () => {
    const orientation = createOrientationReading();
    orientation.beta = 90;
    const out = createMotionReading();
    computeGravityFromOrientation(out, orientation);
    // When device is tilted 90° around X (beta=90), gravity aligns with -Y in device frame.
    expect(out.y).toBeCloseTo(-9.80665, 3);
  });
});

describe('computeQuaternionFromOrientationReading', () => {
  it('converts a zero-rotation orientation to approximately identity quaternion', () => {
    const orientation = createOrientationReading();
    const out = createQuaternionReading();
    computeQuaternionFromOrientationReading(out, orientation);
    expect(out.w).toBeCloseTo(1, 5);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('propagates interval and timestamp from the orientation', () => {
    const orientation = createOrientationReading();
    orientation.interval = 16;
    orientation.timestamp = 12345;
    const out = createQuaternionReading();
    computeQuaternionFromOrientationReading(out, orientation);
    expect(out.interval).toBe(16);
    expect(out.timestamp).toBe(12345);
  });

  it('is alias-safe when out is the same object that contains orientation-like values', () => {
    const orientation = createOrientationReading();
    orientation.alpha = 90;
    const out = createQuaternionReading();
    // Capture expected value with a distinct output first.
    const expected = createQuaternionReading();
    computeQuaternionFromOrientationReading(expected, orientation);
    computeQuaternionFromOrientationReading(out, orientation);
    expect(out.w).toBeCloseTo(expected.w, 5);
    expect(out.x).toBeCloseTo(expected.x, 5);
  });
});

describe('computeRotationMatrixFromQuaternion', () => {
  it('returns identity matrix for identity quaternion', () => {
    const q = createQuaternionReading();
    const out: number[] = new Array(9).fill(0);
    computeRotationMatrixFromQuaternion(out, q);
    // Column-major identity: diagonal elements = 1, off-diagonal = 0.
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[4]).toBeCloseTo(1, 5);
    expect(out[8]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(0, 5);
  });

  it('is alias-safe: output array separate from quaternion does not corrupt quaternion fields', () => {
    const q = createQuaternionReading();
    const out: number[] = new Array(9).fill(0);
    computeRotationMatrixFromQuaternion(out, q);
    // Quaternion should remain identity after the call.
    expect(q.w).toBe(1);
    expect(q.x).toBe(0);
  });
});

describe('computeScreenRelativeOrientation', () => {
  it('returns unchanged orientation when screenAngle is 0', () => {
    const orientation = createOrientationReading();
    orientation.beta = 30;
    orientation.gamma = 15;
    const out = createOrientationReading();
    computeScreenRelativeOrientation(out, orientation, 0);
    expect(out.beta).toBeCloseTo(30, 5);
    expect(out.gamma).toBeCloseTo(15, 5);
    expect(out.alpha).toBeCloseTo(0, 5);
  });

  it('propagates absolute, heading, interval, timestamp, and accuracy', () => {
    const orientation = createOrientationReading();
    orientation.absolute = true;
    orientation.heading = 45;
    orientation.interval = 16;
    orientation.timestamp = 1000;
    orientation.accuracy = 'high';
    const out = createOrientationReading();
    computeScreenRelativeOrientation(out, orientation, 0);
    expect(out.absolute).toBe(true);
    expect(out.heading).toBe(45);
    expect(out.interval).toBe(16);
    expect(out.timestamp).toBe(1000);
    expect(out.accuracy).toBe('high');
  });

  it('is alias-safe when out is separate from orientation', () => {
    const orientation = createOrientationReading();
    orientation.beta = 20;
    orientation.gamma = 10;
    const out = createOrientationReading();
    computeScreenRelativeOrientation(out, orientation, 90);
    // With 90-degree screen rotation: beta' = beta*cos(90) - gamma*sin(90) = -gamma.
    expect(out.beta).toBeCloseTo(-10, 3);
    expect(out.gamma).toBeCloseTo(20, 3);
  });
});

describe('computeWorldAccelerationFromDeviceAcceleration', () => {
  it('returns the same vector for an identity quaternion orientation', () => {
    const accel = createMotionReading();
    accel.x = 1;
    accel.y = 2;
    accel.z = 3;
    const q = createQuaternionReading(); // identity
    const out = createMotionReading();
    computeWorldAccelerationFromDeviceAcceleration(out, accel, q);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(2, 5);
    expect(out.z).toBeCloseTo(3, 5);
  });

  it('propagates interval, timestamp, and accuracy from acceleration', () => {
    const accel = createMotionReading();
    accel.interval = 8;
    accel.timestamp = 42000;
    accel.accuracy = 'low';
    const q = createQuaternionReading();
    const out = createMotionReading();
    computeWorldAccelerationFromDeviceAcceleration(out, accel, q);
    expect(out.interval).toBe(8);
    expect(out.timestamp).toBe(42000);
    expect(out.accuracy).toBe('low');
  });

  it('is alias-safe when out is the same object as acceleration', () => {
    const accel = createMotionReading();
    accel.x = 1;
    accel.y = 0;
    accel.z = 0;
    const q = createQuaternionReading();
    // Out aliases the acceleration input.
    computeWorldAccelerationFromDeviceAcceleration(accel, accel, q);
    expect(accel.x).toBeCloseTo(1, 5);
    expect(accel.y).toBeCloseTo(0, 5);
    expect(accel.z).toBeCloseTo(0, 5);
  });
});

describe('createAmbientLightReading', () => {
  it('allocates a zeroed reading with unknown accuracy and sentinel interval/timestamp', () => {
    const r = createAmbientLightReading();
    expect(r.illuminance).toBe(0);
    expect(r.accuracy).toBe('unknown');
    expect(r.interval).toBe(-1);
    expect(r.timestamp).toBe(-1);
  });
});

describe('createMotionReading', () => {
  it('allocates a zeroed reading with unknown accuracy and sentinel interval/timestamp', () => {
    const r = createMotionReading();
    expect(r).toMatchObject({ x: 0, y: 0, z: 0, accuracy: 'unknown', interval: -1, timestamp: -1 });
  });
});

describe('createOrientationReading', () => {
  it('allocates a zeroed reading with unknown heading, relative frame, and sentinel fields', () => {
    const r = createOrientationReading();
    expect(r).toMatchObject({
      alpha: 0,
      beta: 0,
      gamma: 0,
      absolute: false,
      heading: -1,
      accuracy: 'unknown',
      interval: -1,
      timestamp: -1,
    });
  });
});

describe('createPressureReading', () => {
  it('allocates a zeroed reading with unknown accuracy, sentinel altitude/interval/timestamp', () => {
    const r = createPressureReading();
    expect(r.pressure).toBe(0);
    expect(r.altitude).toBe(-1);
    expect(r.accuracy).toBe('unknown');
    expect(r.interval).toBe(-1);
    expect(r.timestamp).toBe(-1);
  });
});

describe('createProximityReading', () => {
  it('allocates a zeroed reading with sentinel distance and max', () => {
    const r = createProximityReading();
    expect(r.near).toBe(false);
    expect(r.distance).toBe(-1);
    expect(r.max).toBe(-1);
    expect(r.accuracy).toBe('unknown');
  });
});

describe('createQuaternionReading', () => {
  it('allocates an identity quaternion with unknown accuracy and sentinel interval/timestamp', () => {
    const r = createQuaternionReading();
    expect(r).toMatchObject({ w: 1, x: 0, y: 0, z: 0, accuracy: 'unknown', interval: -1, timestamp: -1 });
  });
});

describe('createRotationRateReading', () => {
  it('allocates a zeroed reading with unknown accuracy and sentinel interval/timestamp', () => {
    const r = createRotationRateReading();
    expect(r).toMatchObject({ alpha: 0, beta: 0, gamma: 0, accuracy: 'unknown', interval: -1, timestamp: -1 });
  });
});

describe('createSensors', () => {
  it('creates an entity with all eleven signals', () => {
    const sensors = createSensors();
    expect(sensors.onAbsoluteOrientation).toBeDefined();
    expect(sensors.onAccelerometer).toBeDefined();
    expect(sensors.onAmbientLight).toBeDefined();
    expect(sensors.onBarometer).toBeDefined();
    expect(sensors.onGravity).toBeDefined();
    expect(sensors.onGyroscope).toBeDefined();
    expect(sensors.onLinearAcceleration).toBeDefined();
    expect(sensors.onMagnetometer).toBeDefined();
    expect(sensors.onOrientation).toBeDefined();
    expect(sensors.onProximity).toBeDefined();
    expect(sensors.onQuaternion).toBeDefined();
  });
});

describe('createWebSensorsBackend', () => {
  it('subscribes to all streams without throwing', () => {
    const backend = createWebSensorsBackend();
    const unsubs = [
      backend.subscribeMotion(() => {}),
      backend.subscribeLinearAcceleration(() => {}),
      backend.subscribeGravity(() => {}),
      backend.subscribeOrientation(() => {}),
      backend.subscribeAbsoluteOrientation(() => {}),
      backend.subscribeMagnetometer(() => {}),
      backend.subscribeAmbientLight(() => {}),
      backend.subscribeBarometer(() => {}),
      backend.subscribeProximity(() => {}),
      backend.subscribeQuaternion(() => {}),
    ];
    expect(() => unsubs.forEach((u) => u())).not.toThrow();
  });

  it('resolves a permission request without throwing', async () => {
    expect(typeof (await createWebSensorsBackend().requestPermission())).toBe('boolean');
  });

  it('resolves permission state without throwing', async () => {
    const state = await createWebSensorsBackend().getPermissionState();
    expect(['granted', 'denied', 'prompt', 'unsupported']).toContain(state);
  });
});

describe('detachSensors', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    let accel = 0;
    connectSignal(sensors.onAccelerometer, () => accel++);
    attachSensors(sensors);
    detachSensors(sensors);
    backend.fireMotion(createMotionReading(), createRotationRateReading());
    expect(accel).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const sensors = createSensors();
    expect(() => detachSensors(sensors)).not.toThrow();
  });
});

describe('disposeSensors', () => {
  it('detaches the subscriptions without throwing', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    attachSensors(sensors);
    expect(() => disposeSensors(sensors)).not.toThrow();
  });
});

describe('getSensorsBackend', () => {
  it('falls back to a web backend when none is installed', () => {
    expect(getSensorsBackend()).not.toBeNull();
  });
});

describe('getSensorsPermissionState', () => {
  it('returns a valid permission state string', async () => {
    setSensorsBackend(fakeBackend());
    const state = await getSensorsPermissionState();
    expect(['granted', 'denied', 'prompt', 'unsupported']).toContain(state);
  });
});

describe('hasAccelerometer', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasAccelerometer()).toBe('boolean');
  });

  it('returns true when the backend reports motion support', () => {
    setSensorsBackend(fakeBackend());
    expect(hasAccelerometer()).toBe(true);
  });
});

describe('hasAmbientLightSensor', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasAmbientLightSensor()).toBe('boolean');
  });
});

describe('hasBarometer', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasBarometer()).toBe('boolean');
  });
});

describe('hasGravitySensor', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasGravitySensor()).toBe('boolean');
  });

  it('returns true when the backend reports gravity support', () => {
    setSensorsBackend(fakeBackend());
    expect(hasGravitySensor()).toBe(true);
  });
});

describe('hasGyroscope', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasGyroscope()).toBe('boolean');
  });
});

describe('hasLinearAccelerationSensor', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasLinearAccelerationSensor()).toBe('boolean');
  });

  it('returns true when the backend reports linear acceleration support', () => {
    setSensorsBackend(fakeBackend());
    expect(hasLinearAccelerationSensor()).toBe(true);
  });
});

describe('hasMagnetometer', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasMagnetometer()).toBe('boolean');
  });
});

describe('hasOrientationSensor', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasOrientationSensor()).toBe('boolean');
  });
});

describe('hasProximitySensor', () => {
  it('returns a boolean', () => {
    setSensorsBackend(fakeBackend());
    expect(typeof hasProximitySensor()).toBe('boolean');
  });
});

describe('isSensorsSupported', () => {
  it('returns true when the fake backend reports motion support', () => {
    setSensorsBackend(fakeBackend());
    expect(isSensorsSupported()).toBe(true);
  });

  it('returns false when the backend reports no motion support', () => {
    const backend = fakeBackend();
    vi.spyOn(backend, 'isMotionSupported').mockReturnValue(false);
    setSensorsBackend(backend);
    expect(isSensorsSupported()).toBe(false);
  });
});

describe('requestSensorsPermission', () => {
  it('delegates to the backend', async () => {
    setSensorsBackend(fakeBackend());
    expect(await requestSensorsPermission()).toBe(true);
  });
});

describe('setSensorsBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setSensorsBackend(fakeBackend());
    setSensorsBackend(null);
    expect(getSensorsBackend()).not.toBeNull();
  });

  it('installs a custom backend that is returned by getSensorsBackend', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    expect(getSensorsBackend()).toBe(backend);
  });
});
