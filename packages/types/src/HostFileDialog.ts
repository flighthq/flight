import type {
  DirectoryOpenDialogResult,
  FileOpenDialogResult,
  FileSaveDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  SaveFileDialogOptions,
} from './Dialog.ts';

export interface HostDirectoryOpenDialogCapability {
  open(options?: Readonly<OpenDirectoryDialogOptions>): Promise<DirectoryOpenDialogResult>;
}

export interface HostFileOpenDialogCapability {
  open(options: Readonly<OpenFileDialogOptions>): Promise<FileOpenDialogResult>;
}

export interface HostFileSaveDialogCapability {
  save(options: Readonly<SaveFileDialogOptions>): Promise<FileSaveDialogResult>;
}
