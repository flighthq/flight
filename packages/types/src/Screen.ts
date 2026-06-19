// Display/monitor enumeration seam. Free functions in @flighthq/screen delegate to the active
// ScreenBackend (web default or a native host's). The web sees a single logical screen; a native host
// (Electron/Tauri) reports every attached display. Enumeration writes into caller-owned `out` arrays
// and objects so hot paths allocate nothing.

// A single display's geometry in OS virtual-desktop coordinates. work* excludes OS chrome (taskbar,
// menu bar); scaleFactor is the device-pixel ratio. The web reports one primary screen.
export interface ScreenInfo {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  workWidth: number;
  workHeight: number;
  scaleFactor: number;
  isPrimary: boolean;
}

// The seam every screen query follows: a host backend that fills caller-owned `out` values. Both
// methods return the same `out` they were given so callers can chain or read inline.
export interface ScreenBackend {
  getScreens(out: ScreenInfo[]): ScreenInfo[];
  getPrimaryScreen(out: ScreenInfo): ScreenInfo;
  // Registers a listener invoked on any display/work-area/orientation change; returns an unsubscribe.
  subscribe(listener: () => void): () => void;
}
