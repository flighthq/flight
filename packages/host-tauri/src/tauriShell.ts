import type { ShellBackend, TauriApi } from '@flighthq/types';

// Maps Flight's ShellBackend onto Tauri's async `@tauri-apps/plugin-opener`. Opening a URL or path in
// the OS default handler and revealing a file in the file manager map directly; async operations
// resolve to false on failure rather than throwing (expected-failure surfaces). Tauri exposes no trash
// operation, no Windows .lnk shortcut read/write, and no system beep, so those methods report the
// contract sentinels (false / [] / null / no-op).
export function createTauriShellBackend(tauri: TauriApi): ShellBackend {
  const opener = tauri.opener;
  return {
    async openExternal(url) {
      try {
        await opener.openUrl(url);
        return true;
      } catch {
        return false;
      }
    },
    async openPath(path) {
      try {
        await opener.openPath(path);
        return true;
      } catch {
        return false;
      }
    },
    async openPathResult(path) {
      // Tauri's opener rejects with an error on failure; surface its message, '' on success.
      try {
        await opener.openPath(path);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    async showItemInFolder(path) {
      try {
        await opener.revealItemInDir(path);
        return true;
      } catch {
        return false;
      }
    },
    async moveToTrash() {
      // Tauri's opener has no trash operation; report unsupported.
      return false;
    },
    async moveItemsToTrash(paths) {
      // No trash operation — report per-path failure without pretending success.
      return paths.map(() => false);
    },
    async readShortcutLink() {
      // Tauri has no Windows .lnk shortcut reader; report null.
      return null;
    },
    async writeShortcutLink() {
      // Tauri has no Windows .lnk shortcut writer; report unsupported.
      return false;
    },
    beep() {
      // Tauri exposes no system beep; no-op.
    },
  };
}
