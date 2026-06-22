import type { StatusBarBackend, StatusBarStyle } from '@flighthq/types';

// Builds the default web backend. Web pages have no true status bar, so only setBackgroundColor does
// anything observable: it upserts a <meta name="theme-color"> hint. The rest no-op until a native host
// registers a backend.
export function createWebStatusBarBackend(): StatusBarBackend {
  return {
    setStyle(_style: StatusBarStyle): void {
      // No web status bar; a native host (Capacitor/native shell) is required to honor style.
    },
    setVisible(_visible: boolean): void {
      // No web status bar; a native host is required to show/hide it.
    },
    setBackgroundColor(color: number): void {
      // Derive #rrggbb from the top 24 bits of the packed RGBA integer; alpha is dropped.
      if (typeof document === 'undefined') return;
      const head = document.head;
      if (head === null || head === undefined) return;
      let meta = head.querySelector('meta[name="theme-color"]');
      if (meta === null) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        head.appendChild(meta);
      }
      meta.setAttribute('content', packedRgbaToHexColor(color));
    },
    setOverlaysContent(_overlay: boolean): void {
      // No web status bar; a native host is required to control content overlay.
    },
  };
}

// The active status bar backend, or a lazily-created web default. There is always a backend.
export function getStatusBarBackend(): StatusBarBackend {
  if (_backend === null) _backend = createWebStatusBarBackend();
  return _backend;
}

// Installs a native host status bar backend; pass null to fall back to the web default.
export function setStatusBarBackend(backend: StatusBarBackend | null): void {
  _backend = backend;
}

// Sets the status bar background color from a packed RGBA integer (0xRRGGBBAA). On web this updates the
// theme-color hint; alpha is ignored.
export function setStatusBarColor(color: number): void {
  getStatusBarBackend().setBackgroundColor(color);
}

// Controls whether content draws under the status bar. No-op on web.
export function setStatusBarOverlaysContent(overlay: boolean): void {
  getStatusBarBackend().setOverlaysContent(overlay);
}

// Sets the status bar foreground style ('light' | 'dark' | 'default'). No-op on web.
export function setStatusBarStyle(style: StatusBarStyle): void {
  getStatusBarBackend().setStyle(style);
}

// Shows or hides the status bar. No-op on web.
export function setStatusBarVisible(visible: boolean): void {
  getStatusBarBackend().setVisible(visible);
}

let _backend: StatusBarBackend | null = null;

function packedRgbaToHexColor(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}
