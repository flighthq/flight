import type { DialogBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's DialogBackend onto Electron's main-process dialog module. Open/save dialogs resolve
// to sentinels ([] / null) on cancel rather than throwing, matching the backend contract. The
// modal-parent window is not threaded through here, so dialogs are application-modal (window
// argument undefined).
export function createElectronDialogBackend(electron: ElectronApi): DialogBackend {
  const dialog = electron.dialog;
  return {
    async openFile(options) {
      const properties: string[] = ['openFile'];
      if (options.multiple) properties.push('multiSelections');
      if (options.directory) properties.push('openDirectory');
      const r = await dialog.showOpenDialog(undefined, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties,
      });
      return r.canceled ? [] : r.filePaths;
    },
    async saveFile(options) {
      const r = await dialog.showSaveDialog(undefined, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    async message(options) {
      const r = await dialog.showMessageBox(undefined, {
        type: options.kind,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
        defaultId: options.defaultId,
        cancelId: options.cancelId,
        checkboxLabel: options.checkboxLabel,
        checkboxChecked: options.checkboxChecked,
      });
      return { buttonIndex: r.response, checkboxChecked: r.checkboxChecked };
    },
    async confirm(options) {
      const r = await dialog.showMessageBox(undefined, {
        type: options.kind,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: ['OK', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      return r.response === 0;
    },
    prompt() {
      // Electron has no native text-input dialog; report unsupported via the null sentinel.
      return Promise.resolve(null);
    },
  };
}
