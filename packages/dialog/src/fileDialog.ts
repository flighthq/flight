import { createEntity, createEntityRuntime } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogResult,
  FileDialogHandle,
  FileDialogHandleOperations,
  FileDialogHandleRuntime,
  FileOpenDialogResult,
  FileSaveDialogResult,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// Constructs the identity that crosses from a picker provider into filesystem. `operations` is an
// internal runtime extension point, not serialized descriptor data; native path handles use null.
export function createFileDialogHandle(
  kind: FileDialogHandle['kind'],
  name: string,
  path: string | null,
  operations: FileDialogHandleOperations | null = null,
): FileDialogHandle {
  const handle = createEntity({ kind, name, path }) as FileDialogHandle;
  const runtime = createEntityRuntime() as FileDialogHandleRuntime;
  runtime.operations = operations;
  handle[EntityRuntimeKey] = runtime;
  return handle;
}

// Provider-neutral access to the handle's package-crossing runtime operations. A deserialized DTO or
// forged object has no runtime and therefore cannot acquire authority by matching public fields.
export function getFileDialogHandleOperations(
  handle: Readonly<FileDialogHandle>,
): Readonly<FileDialogHandleOperations> | null {
  const runtime = handle[EntityRuntimeKey] as FileDialogHandleRuntime | undefined;
  return runtime?.operations ?? null;
}

export function showOpenDirectoryDialog(host: HasDialogDirectoryOpen): Promise<DirectoryOpenDialogResult> {
  return host.dialog.directoryOpen.open();
}

export function showOpenFileDialog(
  host: HasDialogFileOpen,
  options: Readonly<OpenFileDialogOptions>,
): Promise<FileOpenDialogResult> {
  return host.dialog.fileOpen.open(options);
}

export function showSaveFileDialog(
  host: HasDialogFileSave,
  options: Readonly<SaveFileDialogOptions>,
): Promise<FileSaveDialogResult> {
  return host.dialog.fileSave.save(options);
}
