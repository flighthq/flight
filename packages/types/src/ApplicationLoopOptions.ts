// Options for startApplicationLoop. Omitted fields fall back to the loop's built-in defaults.
export interface ApplicationLoopOptions {
  // Maximum per-frame delta in milliseconds; clamps huge gaps after a tab restore or pause.
  maxDeltaTime?: number;
  // Target frames per second; 0 disables the cap (run as fast as the backend schedules frames).
  targetFrameRate?: number;
  // Frames per second while the page/window is backgrounded; 0 uses the same rate as foreground.
  backgroundFrameRate?: number;
  // Fixed-timestep size in milliseconds for onFixedUpdate; 0 disables fixed mode (pure variable).
  fixedTimeStep?: number;
  // Maximum fixed-update iterations per frame; a spiral-of-death guard for fixed-timestep mode.
  maxUpdatesPerFrame?: number;
}
