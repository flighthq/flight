import { packedRgbaToHexColor } from '@flighthq/statusbar/contract';
import type { StatusBarColorBackend } from '@flighthq/types/contract';

// Web owns one honest status-bar-adjacent operation: writing the document theme-color hint. It does
// not claim native status-bar snapshots, foreground style, visibility, overlays, or change events.
export const webStatusBarColorBackend: StatusBarColorBackend = {
  setBackgroundColor(color): void {
    try {
      if (typeof document === 'undefined' || document.head === null) return;
      let meta = document.head.querySelector('meta[name="theme-color"]');
      if (meta === null) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', packedRgbaToHexColor(color));
    } catch {
      // A missing or restricted DOM is the operation's documented no-effect runtime outcome.
    }
  },
};
