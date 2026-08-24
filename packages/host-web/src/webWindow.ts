import { installWindowHostBackend, observeWindowHostResult } from '@flighthq/application/contract';
import type { WindowBackend } from '@flighthq/types/contract';

export function enableHostWebWindow(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: WindowBackend = {
    center(win) {
      if (typeof window === 'undefined' || typeof window.moveTo !== 'function' || typeof screen === 'undefined') return;
      try {
        window.moveTo(
          Math.round((screen.availWidth - win.width) / 2),
          Math.round((screen.availHeight - win.height) / 2),
        );
        observeWindowHostResult('center', true);
      } catch {
        observeWindowHostResult('center', false);
      }
    },
    close() {
      if (typeof window !== 'undefined' && typeof window.close === 'function') {
        try {
          window.close();
          observeWindowHostResult('close', true);
        } catch {
          observeWindowHostResult('close', false);
        }
      }
    },
    flashWindowFrame() {},
    focus() {
      if (typeof window !== 'undefined' && typeof window.focus === 'function') {
        window.focus();
        observeWindowHostResult('focus', true);
      }
    },
    getBounds(win, out) {
      if (typeof window === 'undefined') {
        out.x = win.x;
        out.y = win.y;
        out.width = win.width;
        out.height = win.height;
        observeWindowHostResult('getBounds', true);
        return out;
      }
      out.x = window.screenX ?? win.x;
      out.y = window.screenY ?? win.y;
      out.width = window.innerWidth ?? win.width;
      out.height = window.innerHeight ?? win.height;
      observeWindowHostResult('getBounds', true);
      return out;
    },
    hide() {},
    maximize() {},
    minimize() {},
    open() {
      const result = typeof window !== 'undefined';
      observeWindowHostResult('open', result);
      return result;
    },
    requestAttention() {},
    restore() {},
    setAlwaysOnTop() {},
    setContentProtection() {},
    setFullscreen(_win, fullscreen) {
      if (typeof document === 'undefined') return;
      try {
        if (fullscreen) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
        observeWindowHostResult('setFullscreen', true);
      } catch {
        observeWindowHostResult('setFullscreen', false);
      }
    },
    setHasShadow() {},
    setIcon(_win, icon) {
      if (typeof document === 'undefined') return;
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link === null) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = icon;
      observeWindowHostResult('setIcon', true);
    },
    setMaximumSize() {},
    setMenuBarVisible() {},
    setMinimumSize() {},
    setOpacity() {},
    setParent() {},
    setPosition(_win, x, y) {
      if (typeof window !== 'undefined' && typeof window.moveTo === 'function') {
        try {
          window.moveTo(x, y);
          observeWindowHostResult('setPosition', true);
        } catch {
          observeWindowHostResult('setPosition', false);
        }
      }
    },
    setProgress() {},
    setResizable() {},
    setSize(_win, width, height) {
      if (typeof window !== 'undefined' && typeof window.resizeTo === 'function') {
        try {
          window.resizeTo(width, height);
          observeWindowHostResult('setSize', true);
        } catch {
          observeWindowHostResult('setSize', false);
        }
      }
    },
    setSkipTaskbar() {},
    setTitle(_win, title) {
      if (typeof document !== 'undefined') {
        document.title = title;
        observeWindowHostResult('setTitle', true);
      }
    },
    show() {},
  };
  installWindowHostBackend(backend);
}

export function resetHostWebWindowForTest(): void {
  _enabled = false;
}

let _enabled = false;
