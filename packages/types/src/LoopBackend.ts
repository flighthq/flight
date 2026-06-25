// Frame-scheduling seam for the application main loop. The web backend wraps requestAnimationFrame /
// cancelAnimationFrame / performance.now; a native host drives the same callbacks from its own loop.
export interface LoopBackend {
  // Schedules callback for the next frame; returns an opaque handle usable with cancelFrame.
  requestFrame(callback: (time: number) => void): unknown;
  // Cancels a previously scheduled frame by its handle.
  cancelFrame(handle: unknown): void;
  // The current high-resolution time in milliseconds.
  now(): number;
}
