import type { Signal } from './Signal';

export interface MotionReading {
  x: number;
  y: number;
  z: number;
}

export interface OrientationReading {
  alpha: number;
  beta: number;
  gamma: number;
  // True when the reading is relative to Earth's frame (absolute orientation) rather than an arbitrary start.
  absolute: boolean;
  // Compass heading in degrees, or -1 when the host cannot supply one.
  heading: number;
}

// Event seam for device motion and orientation sensors: independent motion and orientation
// subscriptions plus a permission request. The web backend wraps the devicemotion and
// deviceorientation events; a native host reports its own sensor readings through the same callbacks.
export interface SensorsBackend {
  // Registers a listener invoked with acceleration and rotation rate readings; returns unsubscribe.
  subscribeMotion(
    listener: (acceleration: Readonly<MotionReading>, rotationRate: Readonly<MotionReading>) => void,
  ): () => void;
  // Registers a listener invoked with orientation readings; returns an unsubscribe function.
  subscribeOrientation(listener: (orientation: Readonly<OrientationReading>) => void): () => void;
  // Registers a listener invoked with magnetometer readings (x/y/z in microtesla); returns unsubscribe.
  subscribeMagnetometer(listener: (reading: Readonly<MotionReading>) => void): () => void;
  // Requests sensor permission where the host gates it (iOs); resolves true when granted.
  requestPermission(): Promise<boolean>;
}

// Device sensor event entity. Enable delivery with attachSensors; the signals stay inert until then.
export interface Sensors {
  onAccelerometer: Signal<(reading: Readonly<MotionReading>) => void>;
  onGyroscope: Signal<(reading: Readonly<MotionReading>) => void>;
  onMagnetometer: Signal<(reading: Readonly<MotionReading>) => void>;
  onOrientation: Signal<(reading: Readonly<OrientationReading>) => void>;
}
