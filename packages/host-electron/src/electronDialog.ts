import { createFileDialogHandle } from '@flighthq/dialog/contract';
import { createEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogBackend,
  DirectoryOpenDialogResult,
  ElectronApi,
  Entity,
  EntityRuntimeKey,
  FileDialogFilter,
  FileOpenDialogBackend,
  FileOpenDialogResult,
  FileSaveDialogBackend,
  FileSaveDialogResult,
  MessageDialogBackend,
} from '@flighthq/types/contract';

export function createElectronDirectoryOpenDialogBackend(electron: ElectronApi): DirectoryOpenDialogBackend & Entity {
  return createEntity({
    async open(): Promise<DirectoryOpenDialogResult> {
      const dialog = electron.dialog;
      if (typeof dialog?.showOpenDialog !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const result = await dialog.showOpenDialog(undefined, { properties: ['openDirectory'] });
        if (result.canceled) return { outcome: 'cancelled' };
        const [path] = result.filePaths;
        if (path === undefined) return { outcome: 'directory-open-failed' };
        return {
          handle: createNativeHandle(path, 'Directory'),
          outcome: 'selected',
        };
      } catch (error) {
        return { outcome: classifyFailure(error, 'directory-open-failed') };
      }
    },
  } satisfies Omit<DirectoryOpenDialogBackend, typeof EntityRuntimeKey>);
}

export function createElectronFileOpenDialogBackend(electron: ElectronApi): FileOpenDialogBackend & Entity {
  return createEntity({
    async open(options): Promise<FileOpenDialogResult> {
      const dialog = electron.dialog;
      if (typeof dialog?.showOpenDialog !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const properties = ['openFile'];
        if (options.multiple === true) properties.push('multiSelections');
        const result = await dialog.showOpenDialog(undefined, {
          filters: toElectronFilters(options.filters),
          properties,
        });
        if (result.canceled) return { outcome: 'cancelled' };
        if (result.filePaths.length === 0) return { outcome: 'file-open-failed' };
        const handles = result.filePaths.map((path) => createNativeHandle(path, 'File'));
        return {
          handles: handles as [(typeof handles)[number], ...(typeof handles)[number][]],
          outcome: 'selected',
        };
      } catch (error) {
        return { outcome: classifyFailure(error, 'file-open-failed') };
      }
    },
  } satisfies Omit<FileOpenDialogBackend, typeof EntityRuntimeKey>);
}

export function createElectronFileSaveDialogBackend(electron: ElectronApi): FileSaveDialogBackend & Entity {
  return createEntity({
    async save(options): Promise<FileSaveDialogResult> {
      const dialog = electron.dialog;
      if (typeof dialog?.showSaveDialog !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const result = await dialog.showSaveDialog(undefined, {
          defaultPath: options.defaultName,
          filters: toElectronFilters(options.filters),
        });
        if (result.canceled) return { outcome: 'cancelled' };
        if (result.filePath === undefined || result.filePath === '') return { outcome: 'file-save-failed' };
        return { handle: createNativeHandle(result.filePath, 'File'), outcome: 'selected' };
      } catch (error) {
        return { outcome: classifyFailure(error, 'file-save-failed') };
      }
    },
  } satisfies Omit<FileSaveDialogBackend, typeof EntityRuntimeKey>);
}

// Electron provides message boxes and confirmation, but no native text-input prompt. Consumers can
// therefore assemble dialog.message while leaving dialog.prompt absent.
export function createElectronMessageDialogBackend(electron: ElectronApi): MessageDialogBackend {
  const dialog = electron.dialog;
  return {
    async message(options) {
      const result = await dialog.showMessageBox(undefined, {
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
        buttonIndex: result.response,
        cancelled: options.cancelId !== undefined && result.response === options.cancelId,
        checkboxChecked: result.checkboxChecked,
      };
    },
    async confirm(options) {
      const result = await dialog.showMessageBox(undefined, {
        type: options.kind,
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: ['OK', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      return result.response === 0;
    },
  };
}

function createNativeHandle(path: string, kind: 'File' | 'Directory') {
  return createFileDialogHandle(kind, basename(path), path);
}

function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  if (normalized === '') return path.startsWith('\\') ? '\\' : '/';
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function toElectronFilters(filters: readonly FileDialogFilter[] | undefined) {
  if (filters === undefined) return undefined;
  const result = filters
    .map((filter) => ({ name: filter.name, extensions: flattenExtensions(filter) }))
    .filter((filter) => filter.extensions.length > 0);
  return result.length > 0 ? result : undefined;
}

function flattenExtensions(filter: Readonly<FileDialogFilter>): string[] {
  const extensions = new Set<string>();
  for (const values of Object.values(filter.accept)) {
    for (const extension of values) {
      const normalized = extension.replace(/^\./, '');
      if (normalized !== '' && normalized !== '*') extensions.add(normalized);
    }
  }
  return [...extensions];
}

function classifyFailure<Failure extends string>(error: unknown, failure: Failure): 'security-denied' | Failure {
  if (error !== null && typeof error === 'object') {
    const name = 'name' in error && typeof error.name === 'string' ? error.name : null;
    const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
    if (name === 'SecurityError' || name === 'NotAllowedError' || code === 'EACCES' || code === 'EPERM') {
      return 'security-denied';
    }
  }
  return failure;
}
