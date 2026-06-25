import type { DialogBackend, FileDialogHandle } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's DialogBackend onto Electron's main-process dialog module. Open/save dialogs resolve
// to sentinels ([] / null) on cancel rather than throwing, matching the backend contract. Native paths
// are wrapped as FileDialogHandles (path populated, since Electron exposes real host paths). The
// modal-parent window is not threaded through here, so dialogs are application-modal (window undefined).
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
      const kind = options.directory ? 'Directory' : 'File';
      return r.canceled ? [] : r.filePaths.map((path) => toFileHandle(path, kind));
    },
    async openDirectory(options) {
      const properties: string[] = ['openDirectory'];
      if (options.multiple) properties.push('multiSelections');
      const r = await dialog.showOpenDialog(undefined, {
        title: options.title,
        properties,
      });
      return r.canceled ? [] : r.filePaths.map((path) => toFileHandle(path, 'Directory'));
    },
    async saveFile(options) {
      const r = await dialog.showSaveDialog(undefined, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });
      return r.canceled || !r.filePath ? null : toFileHandle(r.filePath, 'File');
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
      return {
        buttonIndex: r.response,
        cancelled: options.cancelId !== undefined && r.response === options.cancelId,
        checkboxChecked: r.checkboxChecked,
      };
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

function toFileHandle(path: string, kind: 'File' | 'Directory'): FileDialogHandle {
  return { kind, name: basename(path), path };
}

function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}
