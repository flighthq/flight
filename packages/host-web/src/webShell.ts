import { installShellHostBackend, observeShellHostResult } from '@flighthq/shell/contract';
import type { ShellBackend } from '@flighthq/types/contract';

export function enableHostWebShell(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: ShellBackend = {
    beep() {},
    async moveItemsToTrash() {
      return [];
    },
    async moveToTrash() {
      return false;
    },
    async openExternal(url) {
      if (typeof window === 'undefined' || typeof window.open !== 'function') {
        observeShellHostResult('openExternal', false);
        return false;
      }
      try {
        const result = window.open(url, '_blank', 'noopener') !== null;
        observeShellHostResult('openExternal', result);
        return result;
      } catch {
        observeShellHostResult('openExternal', false);
        return false;
      }
    },
    async openPath() {
      return false;
    },
    async openPathResult() {
      return 'unavailable on web';
    },
    async readShortcutLink() {
      return null;
    },
    async showItemInFolder() {
      return false;
    },
    async writeShortcutLink() {
      return false;
    },
  };
  installShellHostBackend(backend);
}

export function resetHostWebShellForTest(): void {
  _enabled = false;
}

let _enabled = false;
