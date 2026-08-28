import { installMenuHostBackend, observeMenuHostResult, showWebContextMenu } from '@flighthq/menu/contract';
import type { MenuBackend } from '@flighthq/types/contract';

export function enableHostWebMenu(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: MenuBackend = {
    destroy() {},
    popupContextMenu(items, x, y) {
      try {
        const result = showWebContextMenu(items, x, y);
        observeMenuHostResult('popupContextMenu', true);
        return result;
      } catch {
        observeMenuHostResult('popupContextMenu', false);
        return Promise.resolve(null);
      }
    },
    setApplicationMenu() {
      return false;
    },
    subscribeSelect() {
      return () => {};
    },
  };
  installMenuHostBackend(backend);
}

export function resetHostWebMenuForTest(): void {
  _enabled = false;
}

let _enabled = false;
