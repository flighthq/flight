import type {
  DirectoryOpenDialogResult,
  FileOpenDialogResult,
  FileSaveDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from './Dialog';
import type { Entity } from './Entity';

export interface DirectoryOpenDialogBackend extends Entity {
  open(options?: Readonly<OpenDirectoryDialogOptions>): Promise<DirectoryOpenDialogResult>;
}

export interface FileOpenDialogBackend extends Entity {
  open(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult>;
}

export interface FileSaveDialogBackend extends Entity {
  save(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult>;
}
