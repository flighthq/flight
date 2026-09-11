import type {
  DirectoryOpenDialogResult,
  FileOpenDialogResult,
  FileSaveDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from './Dialog';
import type { Entity } from './Entity';

export interface HostDirectoryOpenDialogProvider extends Entity {
  open(options?: Readonly<OpenDirectoryDialogOptions>): Promise<DirectoryOpenDialogResult>;
}

export interface HostFileOpenDialogProvider extends Entity {
  open(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult>;
}

export interface HostFileSaveDialogProvider extends Entity {
  save(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult>;
}
