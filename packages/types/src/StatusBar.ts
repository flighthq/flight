// Mobile status bar seam. Free functions in @flighthq/statusbar delegate to the active StatusBarBackend
// (web default or a native host's). Web has no real status bar; only the theme-color hint is honored,
// the rest are no-ops until a native host registers a backend.
export type StatusBarStyle = 'light' | 'dark' | 'default';

export interface StatusBarBackend {
  setStyle(style: StatusBarStyle): void;
  setVisible(visible: boolean): void;
  // `color` is a packed RGBA integer (0xRRGGBBAA, Flight convention).
  setBackgroundColor(color: number): void;
  setOverlaysContent(overlay: boolean): void;
}
