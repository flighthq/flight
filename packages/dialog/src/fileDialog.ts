import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogResult,
  EntityConstruction,
  FileDialogHandle,
  FileDialogHandleOperations,
  FileDialogHandleRuntime,
  FileOpenDialogResult,
  FileSaveDialogResult,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  OpenDirectoryDialogOptions,
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
  const handle = allocateEntity<FileDialogHandle>();
  handle.kind = kind;
  handle.name = name;
  handle.path = path;
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

export function showOpenDirectoryDialog(
  host: HasDialogDirectoryOpen,
  options?: Readonly<OpenDirectoryDialogOptions>,
): Promise<DirectoryOpenDialogResult> {
  return options === undefined ? host.dialog.directoryOpen.open() : host.dialog.directoryOpen.open(options);
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
