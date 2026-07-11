import type { StatusBarBackend, StatusBarInfo, StatusBarStyle } from '@flighthq/types';

import type { CapacitorApi, CapacitorStatusBarInfoResult } from './capacitorModule';

// Maps Flight's StatusBarBackend onto Capacitor's `@capacitor/status-bar`. The setters are async and fire
// fire-and-forget: setStyle, setBackgroundColor (a packed RGBA int → a `#RRGGBB` hex string, dropping
// alpha the plugin ignores), setVisible (→ show/hide), and setOverlaysContent (→ setOverlaysWebView).
// getInfo is a synchronous snapshot while Capacitor's getInfo is async, so it is served from a value
// prefetched once at construction (default until it resolves). Capacitor emits no status-bar change
// event, so subscribe is inert.
export function createCapacitorStatusBarBackend(capacitor: CapacitorApi): StatusBarBackend {
  const statusBar = capacitor.statusBar;
  // Sync getInfo over async Capacitor: prefetch the snapshot once and cache it.
  let cachedInfo: CapacitorStatusBarInfoResult | null = null;
  statusBar
    .getInfo()
    .then((info) => {
      cachedInfo = info;
    })
    .catch(() => {
      /* leave null → defaults */
    });
  return {
    getInfo(out: StatusBarInfo): StatusBarInfo {
      const info = cachedInfo;
      out.color = info?.color !== undefined ? hexToRgba(info.color) : 0;
      // Capacitor does not report a status-bar height; -1 sentinel per the contract.
      out.height = -1;
      out.overlaysContent = info?.overlays ?? false;
      out.style = info !== null ? toStatusBarStyle(info.style) : 'default';
      out.visible = info?.visible ?? true;
      return out;
    },
    setBackgroundColor(color: number) {
      statusBar.setBackgroundColor({ color: rgbaToHex(color) }).catch(() => {});
    },
    setOverlaysContent(overlay: boolean) {
      statusBar.setOverlaysWebView({ overlay }).catch(() => {});
    },
    setStyle(style: StatusBarStyle) {
      statusBar.setStyle({ style: toCapacitorStyle(style) }).catch(() => {});
    },
    setVisible(visible: boolean) {
      if (visible) statusBar.show().catch(() => {});
      else statusBar.hide().catch(() => {});
    },
    subscribe() {
      // Capacitor emits no status-bar change event; inert unsubscribe.
      return () => {};
    },
  };
}

// Flight status-bar style ('light' | 'dark' | 'default') → Capacitor Style ('Light' | 'Dark' | 'Default').
function toCapacitorStyle(style: StatusBarStyle): string {
  if (style === 'light') return 'Light';
  if (style === 'dark') return 'Dark';
  return 'Default';
}

function toStatusBarStyle(style: string): StatusBarStyle {
  if (style === 'Light') return 'light';
  if (style === 'Dark') return 'dark';
  return 'default';
}

// A packed RGBA integer (0xRRGGBBAA) → a `#RRGGBB` hex string; Capacitor's color takes no alpha channel.
function rgbaToHex(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

// A `#RRGGBB` (or `#RRGGBBAA`) hex string → a packed RGBA integer (0xRRGGBBAA), opaque when no alpha.
function hexToRgba(hex: string): number {
  const digits = hex.replace(/^#/, '');
  if (digits.length === 8) return Number.parseInt(digits, 16) >>> 0;
  if (digits.length === 6) return ((Number.parseInt(digits, 16) << 8) | 0xff) >>> 0;
  return 0;
}
