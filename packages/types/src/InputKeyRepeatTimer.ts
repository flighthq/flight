/**
 * Handle returned by `createInputKeyRepeatTimer`. Drives key-repeat synthesis
 * for non-DOM input sources (e.g. gamepad d-pads): `start` begins the
 * delay-then-interval repeat cycle, invoking `callback` on each tick, and
 * `stop` cancels it. The handle is reusable across press/release cycles.
 */
export interface InputKeyRepeatTimer {
  start(callback: () => void): void;
  stop(): void;
}
