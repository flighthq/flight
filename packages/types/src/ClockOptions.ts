// Initial configuration for createClock / createChildClock. Both fields are optional; a clock defaults
// to realtime and running (scale 1, not paused).
export interface ClockOptions {
  // Initial local time scale. Defaults to 1 (realtime).
  scale?: number;
  // Whether the clock starts paused. Defaults to false.
  paused?: boolean;
}
