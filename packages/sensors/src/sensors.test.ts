import { connectSignal } from '@flighthq/signals';
import type { MotionReading, OrientationReading, SensorsBackend } from '@flighthq/types';

import {
  attachSensors,
  createMotionReading,
  createOrientationReading,
  createSensors,
  createWebSensorsBackend,
  detachSensors,
  disposeSensors,
  getSensorsBackend,
  requestSensorsPermission,
  setSensorsBackend,
} from './sensors';

function fakeBackend(): SensorsBackend & {
  fireMotion: (acceleration: MotionReading, rotationRate: MotionReading) => void;
  fireOrientation: (orientation: OrientationReading) => void;
  fireMagnetometer: (reading: MotionReading) => void;
} {
  let motionListener: ((a: Readonly<MotionReading>, r: Readonly<MotionReading>) => void) | null = null;
  let orientationListener: ((o: Readonly<OrientationReading>) => void) | null = null;
  let magnetometerListener: ((reading: Readonly<MotionReading>) => void) | null = null;
  return {
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
    subscribeMagnetometer(l) {
      magnetometerListener = l;
      return () => {
        magnetometerListener = null;
      };
    },
    async requestPermission() {
      return true;
    },
    fireMotion(acceleration, rotationRate) {
      motionListener?.(acceleration, rotationRate);
    },
    fireOrientation(orientation) {
      orientationListener?.(orientation);
    },
    fireMagnetometer(reading) {
      magnetometerListener?.(reading);
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
    let orient = 0;
    let magnet = 0;
    connectSignal(sensors.onAccelerometer, () => accel++);
    connectSignal(sensors.onGyroscope, () => gyro++);
    connectSignal(sensors.onOrientation, () => orient++);
    connectSignal(sensors.onMagnetometer, () => magnet++);
    attachSensors(sensors);
    backend.fireMotion(createMotionReading(), createMotionReading());
    backend.fireOrientation(createOrientationReading());
    backend.fireMagnetometer(createMotionReading());
    expect(accel).toBe(1);
    expect(gyro).toBe(1);
    expect(orient).toBe(1);
    expect(magnet).toBe(1);
  });
});

describe('createMotionReading', () => {
  it('allocates a zeroed reading', () => {
    expect(createMotionReading()).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('createOrientationReading', () => {
  it('allocates a zeroed reading with unknown heading and relative frame', () => {
    expect(createOrientationReading()).toEqual({ alpha: 0, beta: 0, gamma: 0, absolute: false, heading: -1 });
  });
});

describe('createSensors', () => {
  it('creates an entity with four signals', () => {
    const sensors = createSensors();
    expect(sensors.onAccelerometer).toBeDefined();
    expect(sensors.onGyroscope).toBeDefined();
    expect(sensors.onMagnetometer).toBeDefined();
    expect(sensors.onOrientation).toBeDefined();
  });
});

describe('createWebSensorsBackend', () => {
  it('subscribes to motion, orientation, and magnetometer without throwing', () => {
    const backend = createWebSensorsBackend();
    const unsubscribeMotion = backend.subscribeMotion(() => {});
    const unsubscribeOrientation = backend.subscribeOrientation(() => {});
    const unsubscribeMagnetometer = backend.subscribeMagnetometer(() => {});
    expect(() => {
      unsubscribeMotion();
      unsubscribeOrientation();
      unsubscribeMagnetometer();
    }).not.toThrow();
  });

  it('resolves a permission without throwing', async () => {
    expect(typeof (await createWebSensorsBackend().requestPermission())).toBe('boolean');
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
    backend.fireMotion(createMotionReading(), createMotionReading());
    expect(accel).toBe(0);
  });
});

describe('disposeSensors', () => {
  it('detaches the subscriptions', () => {
    const backend = fakeBackend();
    setSensorsBackend(backend);
    const sensors = createSensors();
    attachSensors(sensors);
    expect(() => disposeSensors(sensors)).not.toThrow();
  });
});

describe('getSensorsBackend', () => {
  it('falls back to a web backend', () => {
    expect(getSensorsBackend()).not.toBeNull();
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
});
