import type { ScreenBackend, ScreenInfo } from '@flighthq/types';

// Allocates a zeroed ScreenInfo; use as the `out` for getPrimaryScreen or as an array slot for
// getScreens. scaleFactor defaults to 1 (no scaling) and isPrimary to false.
export function createScreenInfo(): ScreenInfo {
  return {
    id: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    workWidth: 0,
    workHeight: 0,
    scaleFactor: 1,
    isPrimary: false,
  };
}

// Builds the default web backend over window.screen. The web reports a single logical display; a
// native host (Electron/Tauri) replaces this to enumerate every attached monitor. Reads fill `out`
// with zeros when window/screen are absent (jsdom) rather than throwing.
export function createWebScreenBackend(): ScreenBackend {
  return {
    getScreens(out) {
      if (typeof window === 'undefined' || typeof window.screen === 'undefined') {
        out.length = 0;
        return out;
      }
      out.length = 1;
      if (out[0] === undefined) out[0] = createScreenInfo();
      fillWebPrimaryScreen(out[0]);
      return out;
    },
    getPrimaryScreen(out) {
      if (typeof window === 'undefined' || typeof window.screen === 'undefined') return out;
      fillWebPrimaryScreen(out);
      return out;
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('resize', listener);
      const orientation = getWebScreenOrientation();
      orientation?.addEventListener?.('change', listener);
      return () => {
        window.removeEventListener('resize', listener);
        orientation?.removeEventListener?.('change', listener);
      };
    },
  };
}

// Fills `out` with the primary display and returns it. The web reports one screen; a native host its
// OS-designated primary monitor.
export function getPrimaryScreen(out: ScreenInfo): ScreenInfo {
  return getScreenBackend().getPrimaryScreen(out);
}

// The active screen backend, or a lazily-created web default. There is always a backend.
export function getScreenBackend(): ScreenBackend {
  if (_backend === null) _backend = createWebScreenBackend();
  return _backend;
}

// Fills `out` with every attached display and returns it. out.length is set to the screen count;
// missing slots are allocated. On the web this is a single screen; an empty array when no window.
export function getScreens(out: ScreenInfo[]): ScreenInfo[] {
  return getScreenBackend().getScreens(out);
}

// Subscribes to display/work-area/orientation changes via the active backend; returns an unsubscribe.
export function onScreenChange(listener: () => void): () => void {
  return getScreenBackend().subscribe(listener);
}

// Installs a native host screen backend; pass null to fall back to the web default.
export function setScreenBackend(backend: ScreenBackend | null): void {
  _backend = backend;
}

let _backend: ScreenBackend | null = null;

interface WebScreenOrientation {
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function fillWebPrimaryScreen(out: ScreenInfo): void {
  const screen = window.screen;
  out.id = 0;
  out.x = 0;
  out.y = 0;
  out.width = screen.width;
  out.height = screen.height;
  out.workWidth = screen.availWidth;
  out.workHeight = screen.availHeight;
  out.scaleFactor = window.devicePixelRatio || 1;
  out.isPrimary = true;
}

function getWebScreenOrientation(): WebScreenOrientation | null {
  if (typeof window === 'undefined' || typeof window.screen === 'undefined') return null;
  const screen = window.screen as Screen & { orientation?: WebScreenOrientation };
  return screen.orientation ?? null;
}
