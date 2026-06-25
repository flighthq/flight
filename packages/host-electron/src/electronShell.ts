import type { ShellBackend, ShellShortcutLink } from '@flighthq/types';

import type { ElectronApi, ElectronShortcutDetails } from './electronModule';

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
    async openPathResult(path) {
      // Electron's openPath returns '' on success and an OS error string on failure — Flight's contract.
      try {
        return await shell.openPath(path);
      } catch {
        return '';
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
    async moveItemsToTrash(paths) {
      // Electron trashes one path at a time; trash each and report per-path success.
      return Promise.all(
        paths.map(async (path) => {
          try {
            await shell.trashItem(path);
            return true;
          } catch {
            return false;
          }
        }),
      );
    },
    async readShortcutLink(shortcutPath) {
      // Windows .lnk only; throws on other platforms or a missing link — report null.
      try {
        const details = shell.readShortcutLink(shortcutPath);
        const link: ShellShortcutLink = {
          target: details.target,
          appUserModelId: details.appUserModelId,
          args: details.args,
          description: details.description,
          icon: details.icon,
          iconIndex: details.iconIndex,
          workingDirectory: details.cwd,
        };
        return link;
      } catch {
        return null;
      }
    },
    async writeShortcutLink(shortcutPath, link, operation = 'create') {
      try {
        const details: ElectronShortcutDetails = {
          target: link.target,
          appUserModelId: link.appUserModelId,
          args: link.args,
          description: link.description,
          icon: link.icon,
          iconIndex: link.iconIndex,
          cwd: link.workingDirectory,
        };
        return shell.writeShortcutLink(shortcutPath, operation, details);
      } catch {
        return false;
      }
    },
    beep() {
      shell.beep();
    },
  };
}
