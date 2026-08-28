import {
  hasMenuHostBackend,
  installMenuHostBackend,
  observeMenuHostResult,
  resetMenuBackendForTest,
  showWebContextMenu,
} from '@flighthq/menu/contract';
import type { MenuBackend } from '@flighthq/types/contract';

export function enableHostWebMenu(): void {
  if (hasMenuHostBackend()) return;
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
  resetMenuBackendForTest();
}
