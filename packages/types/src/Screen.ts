// Display/monitor enumeration seam. Free functions in @flighthq/screen delegate to the active
// ScreenBackend (web default or a native host's). The web sees a single logical screen; a native host
// (Electron/Tauri) reports every attached display. Enumeration writes into caller-owned `out` arrays
// and objects so hot paths allocate nothing.

import type { Entity } from './Entity';
import type { ScreenChangeEvent } from './ScreenChangeEvent';
import type { ScreenColorSpace } from './ScreenColorSpace';
import type { ScreenOrientation } from './ScreenOrientation';

// A single display's geometry in OS virtual-desktop coordinates. work* excludes OS chrome (taskbar,
// menu bar); scaleFactor is the device-pixel ratio. The web reports one primary screen. Fields the
// host cannot supply carry sentinels: numeric metrics are -1, label is '', and touchSupport is
// 'unknown'.
export interface ScreenInfo extends Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  workWidth: number;
  workHeight: number;
  scaleFactor: number;
  isPrimary: boolean;
  // Clockwise rotation of the display in degrees, or -1 when the host does not report it.
  rotation: number;
  orientation: ScreenOrientation;
  // Refresh rate in Hz, or -1 when unknown.
  refreshRate: number;
  // Bits per pixel reported by the host, or -1 when unknown.
  colorDepth: number;
  pixelDepth: number;
  // Display resolution in physical device pixels, or -1 when unknown.
  physicalWidth: number;
  physicalHeight: number;
  isHdr: boolean;
  colorSpace: ScreenColorSpace;
  // Peak luminance in nits for HDR displays, or -1 when unknown.
  maxLuminance: number;
  // Bits per color component, or -1 when unknown.
  depthPerComponent: number;
  // Dots per inch, or -1 when unknown.
  dpi: number;
  // Host-provided display name, or '' when none.
  label: string;
  // True for built-in displays (laptop panel, phone screen).
  internal: boolean;
  // Touch capability of the display, or 'unknown' when the host does not report it.
  touchSupport: string;
  monochrome: boolean;
}

// The seam every screen query follows: a host backend that fills caller-owned `out` values. The
// fill methods return the same `out` they were given so callers can chain or read inline.
// The window-management permission states a screen host can report. Deliberately the three the web
// Permissions API uses, with no `'unsupported'` member: a host that cannot answer omits the operation
// entirely, which is the absence-of-an-export ruling, so there is nothing for a fourth state to mean.
export type ScreenPermissionState = 'denied' | 'granted' | 'prompt';

export interface ScreenQueryBackend extends Entity {
  destroy?(): void;
  getScreens(out: ScreenInfo[]): ScreenInfo[];
  getPrimaryScreen(out: ScreenInfo): ScreenInfo;
  getCursorPosition(out: { x: number; y: number }): { x: number; y: number };
}

export interface ScreenChangeBackend extends Entity {
  subscribe(listener: (event: Readonly<ScreenChangeEvent>) => void): () => void;
}

export interface ScreenDetailsBackend extends Entity {
  queryPermission(): Promise<ScreenPermissionState>;
  request(): Promise<boolean>;
}

export interface ScreenPermissionChangeBackend extends Entity {
  subscribe(listener: (state: ScreenPermissionState) => void): () => void;
}
