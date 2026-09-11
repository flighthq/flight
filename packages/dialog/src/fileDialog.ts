import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import type {
  DirectoryOpenDialogResult,
  FileDialogHandle,
  FileDialogHandleOperations,
  FileDialogHandleRuntime,
  FileOpenDialogResult,
  FileSaveDialogResult,
  HostDirectoryOpenDialogProvider,
  HostFileOpenDialogProvider,
  HostFileSaveDialogProvider,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
  EntityConstruction,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createFileDialogHandle(
  kind: FileDialogHandle['kind'],
  name: string,
  path: string | null,
  operations: FileDialogHandleOperations | null = null,
): FileDialogHandle {
  const handle = allocateEntity<FileDialogHandle>();
  initializeFileDialogHandle(handle, kind, name, path, operations);
  return finishEntity(handle);
}

// Provider-neutral access to the handle's package-crossing runtime operations. A deserialized DTO or
// forged object has no runtime and therefore cannot acquire authority by matching public fields.
export function getFileDialogHandleOperations(
  handle: Readonly<FileDialogHandle>,
): Readonly<FileDialogHandleOperations> | null {
  const runtime = handle[EntityRuntimeKey] as FileDialogHandleRuntime | undefined;
  return runtime?.operations ?? null;
}

// Constructs the identity that crosses from a picker provider into filesystem. `operations` is an
// internal runtime extension point, not serialized descriptor data; native path handles use null.
export function initializeFileDialogHandle(
  handle: EntityConstruction<FileDialogHandle>,
  kind: FileDialogHandle['kind'],
  name: string,
  path: string | null,
  operations: FileDialogHandleOperations | null = null,
): void {
  handle.kind = kind;
  handle.name = name;
  handle.path = path;
  const runtime = createEntityRuntime() as FileDialogHandleRuntime;
  runtime.operations = operations;
  handle[EntityRuntimeKey] = runtime;
}

export function showOpenDirectoryDialog(
  hostDirectoryOpenDialog: Readonly<HostDirectoryOpenDialogProvider>,
  options?: Readonly<OpenDirectoryDialogOptions>,
): Promise<DirectoryOpenDialogResult> {
  return options === undefined ? hostDirectoryOpenDialog.open() : hostDirectoryOpenDialog.open(options);
}

export function showOpenFileDialog(
  hostFileOpenDialog: Readonly<HostFileOpenDialogProvider>,
  options: Readonly<OpenFileDialogOptions>,
): Promise<FileOpenDialogResult> {
  return hostFileOpenDialog.open(options);
}

export function showSaveFileDialog(
  hostFileSaveDialog: Readonly<HostFileSaveDialogProvider>,
  options: Readonly<SaveFileDialogOptions>,
): Promise<FileSaveDialogResult> {
  return hostFileSaveDialog.save(options);
}
