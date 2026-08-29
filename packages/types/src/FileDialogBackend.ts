import type { FileDialogHandle } from './Dialog';
import type { OpenDirectoryDialogOptions } from './Dialog';
import type { OpenFileDialogOptions } from './Dialog';
import type { SaveFileDialogOptions } from './Dialog';

export interface FileDialogBackend {
  openDirectory(options: Readonly<OpenDirectoryDialogOptions>): Promise<FileDialogHandle[]>;
  openFile(options: Readonly<OpenFileDialogOptions>): Promise<FileDialogHandle[]>;
  saveFile(options: Readonly<SaveFileDialogOptions>): Promise<FileDialogHandle | null>;
}
