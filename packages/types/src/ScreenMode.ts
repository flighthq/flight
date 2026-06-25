// One selectable display mode (resolution + refresh + color depth) for a screen. The web reports a
// single synthetic mode derived from the current ScreenInfo; a native host enumerates every mode the
// display supports. Sentinels: refreshRate/colorDepth are -1 and pixelFormat is '' when unknown.
export interface ScreenMode {
  width: number;
  height: number;
  refreshRate: number;
  colorDepth: number;
  // Host-specific pixel format identifier, or '' when none.
  pixelFormat: string;
}
