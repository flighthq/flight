import type { ShellBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's ShellBackend onto Electron's main-process shell module. Async operations resolve to
// false on failure rather than throwing — these are expected-failure surfaces, not programmer
// errors. openPath is special: Electron returns '' on success and an error string otherwise.
export function createElectronShellBackend(electron: ElectronApi): ShellBackend {
  const shell = electron.shell;
  return {
    async openExternal(url) {
      try {
        await shell.openExternal(url);
        return true;
      } catch {
        return false;
      }
    },
    async openPath(path) {
      try {
        const err = await shell.openPath(path);
        return err === '';
      } catch {
        return false;
      }
    },
    async showItemInFolder(path) {
      try {
        shell.showItemInFolder(path);
        return true;
      } catch {
        return false;
      }
    },
    async moveToTrash(path) {
      try {
        await shell.trashItem(path);
        return true;
      } catch {
        return false;
      }
    },
    beep() {
      shell.beep();
    },
  };
}
