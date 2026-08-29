import type { ElectronApi, FileDialogBackend, FileDialogHandle, MessageDialogBackend } from '@flighthq/types/contract';

// Maps Electron's main-process file dialogs onto Flight's file-dialog capability. Native paths are
// wrapped as FileDialogHandles. The modal parent is not threaded through, so dialogs are app-modal.
export function createElectronFileDialogBackend(electron: ElectronApi): FileDialogBackend {
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
  };
}

// Electron provides message boxes and confirmation, but no native text-input prompt. Consumers can
// therefore assemble dialog.message while leaving dialog.prompt absent.
export function createElectronMessageDialogBackend(electron: ElectronApi): MessageDialogBackend {
  const dialog = electron.dialog;
  return {
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
