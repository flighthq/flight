// Well-known host directories. getPath maps these to absolute paths on native hosts, '' on web.
export type FileSystemPathKind = 'home' | 'documents' | 'desktop' | 'downloads' | 'temp' | 'appData' | 'cache';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export type FileWatchEventType = 'created' | 'modified' | 'deleted';

export interface FileWatchEvent {
  type: FileWatchEventType;
  path: string;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  modifiedTime: number;
  createdTime: number;
  isSymlink: boolean;
}

// POSIX-style access bits for a file. Native backends map these to chmod; web/OPFS has no permission
// model and reports null from getFilePermissions / false from setFilePermissions.
export interface FilePermissions {
  readable: boolean;
  writable: boolean;
  executable: boolean;
}

// Disk or storage-quota usage for the active file system. Web reports it via navigator.storage.estimate();
// native via statvfs.
export interface FileSystemUsage {
  usedBytes: number;
  quotaBytes: number;
}

// Required subset shared by Web OPFS and Capacitor Filesystem.
export interface FileSystemBasicBackend {
  appendTextFile(path: string, data: string): Promise<boolean>;
  copy(from: string, to: string): Promise<boolean>;
  directoryExists(path: string): Promise<boolean>;
  fileExists(path: string): Promise<boolean>;
  makeDirectory(path: string): Promise<boolean>;
  readBinaryFile(path: string): Promise<Uint8Array | null>;
  readDirectory(path: string): Promise<FileEntry[]>;
  readTextFile(path: string): Promise<string | null>;
  removeDirectory(path: string, recursive?: boolean): Promise<boolean>;
  removeFile(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<boolean>;
  statFile(path: string): Promise<FileStat | null>;
  writeBinaryFile(path: string, data: Readonly<Uint8Array>): Promise<boolean>;
  writeTextFile(path: string, data: string): Promise<boolean>;
}

// Honest host-provider surface. Provider coverage varies beyond FileSystemBasicBackend, so every
// member is structurally omittable. The seven public absence operations (symlink, permissions, real
// path, watch, and well-known path lookup) are deliberately not host members; @flighthq/filesystem
// owns their documented sentinel results.
export interface FileSystemHostBackend extends Partial<FileSystemBasicBackend> {
  canAccessFile?(path: string, mode: 'readable' | 'writable' | 'executable'): Promise<boolean>;
  getFileSystemUsage?(): Promise<FileSystemUsage | null>;
  openFileReadStream?(path: string): Promise<ReadableStream<Uint8Array> | null>;
  openFileWriteStream?(path: string): Promise<WritableStream<Uint8Array> | null>;
  readBinaryFileRange?(path: string, offset: number, length: number): Promise<Uint8Array | null>;
  readDirectoryRecursive?(path: string, options?: Readonly<FileWalkOptions>): Promise<readonly FileEntry[]>;
  writeFileAtomic?(path: string, data: Readonly<Uint8Array> | string): Promise<boolean>;
}

// Options controlling a recursive directory walk.
export interface FileWalkOptions {
  // Maximum descent depth; omit (or Infinity) to walk the full tree. Depth 0 = entries directly inside the root.
  maxDepth?: number;
}
