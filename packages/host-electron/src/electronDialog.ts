import { createFileDialogHandle } from '@flighthq/dialog/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogBackend,
  DirectoryOpenDialogResult,
  ElectronApi,
  Entity,
  FileDialogFilter,
  FileOpenDialogBackend,
  FileOpenDialogResult,
  FileSaveDialogBackend,
  FileSaveDialogResult,
  MessageDialogBackend,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createElectronDirectoryOpenDialogBackend(electron: ElectronApi): DirectoryOpenDialogBackend & Entity {
  const out = allocateEntity<DirectoryOpenDialogBackend>();
  initializeElectronDirectoryOpenDialogBackend(out, electron);
  return finishEntity(out);
}

export function createElectronFileOpenDialogBackend(electron: ElectronApi): FileOpenDialogBackend & Entity {
  const out = allocateEntity<FileOpenDialogBackend>();
  initializeElectronFileOpenDialogBackend(out, electron);
  return finishEntity(out);
}

export function createElectronFileSaveDialogBackend(electron: ElectronApi): FileSaveDialogBackend & Entity {
  const out = allocateEntity<FileSaveDialogBackend>();
  initializeElectronFileSaveDialogBackend(out, electron);
  return finishEntity(out);
}

export function createElectronMessageDialogBackend(electron: ElectronApi): MessageDialogBackend {
  const out = allocateEntity<MessageDialogBackend>();
  initializeElectronMessageDialogBackend(out, electron);
  return finishEntity(out);
}

export function initializeElectronDirectoryOpenDialogBackend(
  out: EntityConstruction<DirectoryOpenDialogBackend>,
  electron: ElectronApi,
): void {
  out.open = async (options): Promise<DirectoryOpenDialogResult> => {
    if (options?.signal?.aborted) return { outcome: 'cancelled' };
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
  };
}

export function initializeElectronFileOpenDialogBackend(
  out: EntityConstruction<FileOpenDialogBackend>,
  electron: ElectronApi,
): void {
  out.open = async (options): Promise<FileOpenDialogResult> => {
    if (options.signal?.aborted) return { outcome: 'cancelled' };
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
  };
}

export function initializeElectronFileSaveDialogBackend(
  out: EntityConstruction<FileSaveDialogBackend>,
  electron: ElectronApi,
): void {
  out.save = async (options): Promise<FileSaveDialogResult> => {
    if (options.signal?.aborted) return { outcome: 'cancelled' };
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
  };
}

// Electron provides message boxes and confirmation, but no native text-input prompt. Consumers can
// therefore assemble dialog.message while leaving dialog.prompt absent.
export function initializeElectronMessageDialogBackend(
  out: EntityConstruction<MessageDialogBackend>,
  electron: ElectronApi,
): void {
  const dialog = electron.dialog;
  out.message = async (options) => {
    if (options.signal?.aborted) {
      return {
        buttonIndex: options.cancelId ?? 0,
        cancelled: true,
        checkboxChecked: options.checkboxChecked ?? false,
      };
    }
    const result = await dialog.showMessageBox(undefined, {
      type: options.kind,
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.buttons,
      defaultId: options.defaultId,
      cancelId: options.cancelId,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      checkboxLabel: options.checkboxLabel,
      checkboxChecked: options.checkboxChecked,
    });
    return {
      buttonIndex: result.response,
      cancelled: options.cancelId !== undefined && result.response === options.cancelId,
      checkboxChecked: result.checkboxChecked,
    };
  };
  out.confirm = async (options) => {
    if (options.signal?.aborted) return false;
    const result = await dialog.showMessageBox(undefined, {
      type: options.kind,
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return result.response === 0;
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
