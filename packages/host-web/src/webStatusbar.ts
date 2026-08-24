import {
  installStatusBarHostBackend,
  observeStatusBarHostResult,
  packedRgbaToHexColor,
} from '@flighthq/statusbar/contract';
import type { StatusBarBackend, StatusBarInfo } from '@flighthq/types/contract';

export function enableHostWebStatusBar(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: StatusBarBackend = {
    getInfo(out: StatusBarInfo): StatusBarInfo {
      out.color = 0;
      out.height = -1;
      out.overlaysContent = false;
      out.style = 'default';
      out.visible = true;
      return out;
    },
    setBackgroundColor(color: number): void {
      try {
        if (typeof document === 'undefined') {
          observeStatusBarHostResult('setBackgroundColor', false);
          return;
        }
        const head = document.head;
        if (head === null || head === undefined) {
          observeStatusBarHostResult('setBackgroundColor', false);
          return;
        }
        let meta = head.querySelector('meta[name="theme-color"]');
        if (meta === null) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'theme-color');
          head.appendChild(meta);
        }
        meta.setAttribute('content', packedRgbaToHexColor(color));
        observeStatusBarHostResult('setBackgroundColor', true);
      } catch {
        observeStatusBarHostResult('setBackgroundColor', false);
      }
    },
    setOverlaysContent(): void {},
    setStyle(): void {},
    setVisible(): void {},
    subscribe(): () => void {
      return () => {};
    },
  };
  installStatusBarHostBackend(backend);
}

export function resetHostWebStatusBarForTest(): void {
  _enabled = false;
}

let _enabled = false;
