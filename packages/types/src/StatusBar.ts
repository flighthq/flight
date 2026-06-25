import type { Signal } from './Signal';

// Mobile status bar seam. Free functions in @flighthq/statusbar delegate to the active StatusBarBackend
// (web default or a native host's). Web has no real status bar; only the theme-color hint is honored,
// the rest are no-ops until a native host registers a backend.
export type StatusBarStyle = 'light' | 'dark' | 'default';

// Transition used when showing/hiding the status bar. 'none' is the default (immediate); native hosts
// honor the animated variants. Web ignores this entirely.
export type StatusBarAnimation = 'none' | 'fade' | 'slide';

// Opaque handle returned by pushStatusBarStyleEntry and consumed by popStatusBarStyleEntry. A plain
// number; -1 is reserved as the invalid sentinel.
export type StatusBarStyleEntryHandle = number;

// Snapshot of the current status bar state, written into an `out` by getStatusBarInfo. Sentinel values
// (height = -1) indicate the host does not report a field rather than throwing.
export interface StatusBarInfo {
  // Background color as a packed RGBA integer (0xRRGGBBAA, Flight convention); 0 when unknown.
  color: number;
  // Height in CSS pixels, or -1 when the host does not report it (web, desktops).
  height: number;
  // True when content draws under the status bar.
  overlaysContent: boolean;
  style: StatusBarStyle;
  visible: boolean;
}

// One entry on the status bar style stack. Unset fields fall through to the next entry down the stack
// (last pushed wins per field). All fields are optional so a component can set only what it controls.
export interface StatusBarStyleEntry {
  animation?: StatusBarAnimation;
  // Background color as a packed RGBA integer (0xRRGGBBAA, Flight convention).
  color?: number;
  overlaysContent?: boolean;
  style?: StatusBarStyle;
  visible?: boolean;
}

export interface StatusBarBackend {
  // Fills `out` with the current status bar state snapshot and returns it.
  getInfo(out: StatusBarInfo): StatusBarInfo;
  // `color` is a packed RGBA integer (0xRRGGBBAA, Flight convention). `animated` requests a smooth
  // transition on native hosts; web ignores it.
  setBackgroundColor(color: number, animated?: boolean): void;
  setOverlaysContent(overlay: boolean): void;
  setStyle(style: StatusBarStyle): void;
  setVisible(visible: boolean, animation?: StatusBarAnimation): void;
  // Registers a listener invoked on any OS-driven status bar change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
}

// Status bar event entity. Enable delivery with attachStatusBar; the signals stay inert until then.
export interface StatusBar {
  onChange: Signal<(info: Readonly<StatusBarInfo>) => void>;
}
