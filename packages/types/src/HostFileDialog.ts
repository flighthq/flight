import type {
  DirectoryOpenDialogResult,
  FileOpenDialogResult,
  FileSaveDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from './Dialog';
import type { Entity } from './Entity';

export interface HostDirectoryOpenDialogCapability extends Entity {
  open(options?: Readonly<OpenDirectoryDialogOptions>): Promise<DirectoryOpenDialogResult>;
}

export interface HostFileOpenDialogCapability extends Entity {
  open(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult>;
}

export interface HostFileSaveDialogCapability extends Entity {
  save(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult>;
}
