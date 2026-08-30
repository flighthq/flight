import { createFileDialogHandle } from '@flighthq/dialog/contract';
import { createEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogBackend,
  DirectoryOpenDialogResult,
  Entity,
  EntityRuntimeKey,
  FileDialogFilter,
  FileOpenDialogBackend,
  FileOpenDialogResult,
  FileSaveDialogBackend,
  FileSaveDialogResult,
  MessageDialogBackend,
  MessageDialogKind,
  TauriApi,
  TauriDialogFilter,
} from '@flighthq/types/contract';

export function createTauriDirectoryOpenDialogBackend(tauri: TauriApi): DirectoryOpenDialogBackend & Entity {
  return createEntity({
    async open(): Promise<DirectoryOpenDialogResult> {
      const open = tauri.dialog?.open;
      if (typeof open !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const result = await open.call(tauri.dialog, { directory: true, multiple: false });
        const paths = normalizePaths(result);
        if (paths === null) return { outcome: 'cancelled' };
        const [path] = paths;
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

export function createTauriFileOpenDialogBackend(tauri: TauriApi): FileOpenDialogBackend & Entity {
  return createEntity({
    async open(options): Promise<FileOpenDialogResult> {
      const open = tauri.dialog?.open;
      if (typeof open !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const result = await open.call(tauri.dialog, {
          directory: false,
          filters: toTauriFilters(options.filters),
          multiple: options.multiple ?? false,
        });
        const paths = normalizePaths(result);
        if (paths === null) return { outcome: 'cancelled' };
        if (paths.length === 0) return { outcome: 'file-open-failed' };
        const handles = paths.map((path) => createNativeHandle(path, 'File'));
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

export function createTauriFileSaveDialogBackend(tauri: TauriApi): FileSaveDialogBackend & Entity {
  return createEntity({
    async save(options): Promise<FileSaveDialogResult> {
      const save = tauri.dialog?.save;
      if (typeof save !== 'function') return { outcome: 'runtime-unavailable' };
      try {
        const path = await save.call(tauri.dialog, {
          defaultPath: options.defaultName,
          filters: toTauriFilters(options.filters),
        });
        if (path === null) return { outcome: 'cancelled' };
        if (path === '') return { outcome: 'file-save-failed' };
        return { handle: createNativeHandle(path, 'File'), outcome: 'selected' };
      } catch (error) {
        return { outcome: classifyFailure(error, 'file-save-failed') };
      }
    },
  } satisfies Omit<FileSaveDialogBackend, typeof EntityRuntimeKey>);
}

// Tauri provides message and confirmation surfaces but no native text-input prompt. Consumers can
// therefore assemble dialog.message while leaving dialog.prompt absent.
export function createTauriMessageDialogBackend(tauri: TauriApi): MessageDialogBackend {
  const dialog = tauri.dialog;
  return {
    async message(options) {
      await dialog.message(options.message, {
        title: options.title,
        kind: toTauriMessageKind(options.kind),
      });
      return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
    },
    async confirm(options) {
      return dialog.confirm(options.message, {
        title: options.title,
        kind: toTauriMessageKind(options.kind),
      });
    },
  };
}

function createNativeHandle(path: string, kind: 'File' | 'Directory') {
  return createFileDialogHandle(kind, basename(path), path);
}

function normalizePaths(result: string | string[] | null): string[] | null {
  if (result === null) return null;
  return Array.isArray(result) ? result : [result];
}

function toTauriFilters(filters: readonly FileDialogFilter[] | undefined): TauriDialogFilter[] | undefined {
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

function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  if (normalized === '') return path.startsWith('\\') ? '\\' : '/';
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
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

function toTauriMessageKind(kind: MessageDialogKind | undefined): 'info' | 'warning' | 'error' {
  if (kind === 'warning') return 'warning';
  if (kind === 'error') return 'error';
  return 'info';
}
