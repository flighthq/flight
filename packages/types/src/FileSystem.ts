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

// Options controlling a recursive directory walk.
export interface FileWalkOptions {
  // Maximum descent depth; omit (or Infinity) to walk the full tree. Depth 0 = entries directly inside the root.
  maxDepth?: number;
}

// File system seam. Free functions in @flighthq/filesystem delegate to the active backend (web OPFS
// default or a native host's). Reads resolve to null / [], writes to false when the host lacks access
// or the entry is missing, rather than throwing — absent files are an expected outcome, not an error.
export interface FileSystemBackend {
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, data: string): Promise<boolean>;
  readBinaryFile(path: string): Promise<Uint8Array | null>;
  // Reads a byte slice of length `length` starting at `offset`. Out-of-range offset resolves to an
  // empty Uint8Array; missing file / access denied to null.
  readBinaryFileRange(path: string, offset: number, length: number): Promise<Uint8Array | null>;
  writeBinaryFile(path: string, data: Readonly<Uint8Array>): Promise<boolean>;
  // Atomic write: writes to a temp sibling then moves it into place. Web (OPFS) is best-effort copy+remove.
  writeFileAtomic(path: string, data: Readonly<Uint8Array> | string): Promise<boolean>;
  fileExists(path: string): Promise<boolean>;
  directoryExists(path: string): Promise<boolean>;
  removeFile(path: string): Promise<boolean>;
  // Removes a directory; when `recursive` is false (default) fails on non-empty directories.
  removeDirectory(path: string, recursive?: boolean): Promise<boolean>;
  makeDirectory(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<FileEntry[]>;
  // Depth-first walk returning all descendants; [] when missing or access is denied.
  readDirectoryRecursive(path: string, options?: Readonly<FileWalkOptions>): Promise<readonly FileEntry[]>;
  statFile(path: string): Promise<FileStat | null>;
  rename(from: string, to: string): Promise<boolean>;
  copy(from: string, to: string): Promise<boolean>;
  appendTextFile(path: string, data: string): Promise<boolean>;
  // Opens a ReadableStream over the file; null when missing, access denied, or unsupported.
  openFileReadStream(path: string): Promise<ReadableStream<Uint8Array> | null>;
  // Opens a WritableStream to the file (created when absent); null when access denied or unsupported.
  openFileWriteStream(path: string): Promise<WritableStream<Uint8Array> | null>;
  // Creates a symbolic link at `linkPath` pointing to `target`. Native-only; web/OPFS returns false.
  createFileSymlink(target: string, linkPath: string): Promise<boolean>;
  // Reads a symbolic link's target; null when not a symlink, missing, or unsupported (web returns null).
  readFileSymlink(path: string): Promise<string | null>;
  // Resolves a path to its canonical (symlink-free) absolute path; null when missing or unsupported.
  getFileRealPath(path: string): Promise<string | null>;
  // POSIX permission attributes for `path`; null when unsupported (web returns null).
  getFilePermissions(path: string): Promise<FilePermissions | null>;
  // Sets POSIX permissions; false when unsupported (web returns false).
  setFilePermissions(path: string, permissions: Readonly<FilePermissions>): Promise<boolean>;
  // True when `path` can be accessed in the given mode. Web returns false for 'executable'.
  canAccessFile(path: string, mode: 'readable' | 'writable' | 'executable'): Promise<boolean>;
  // Disk/quota usage for the active file system; null when unavailable.
  getFileSystemUsage(): Promise<FileSystemUsage | null>;
  // Returns an unsubscribe function; native hosts deliver change events, web returns a no-op.
  watch(path: string, listener: (event: Readonly<FileWatchEvent>) => void): () => void;
  getPath(kind: FileSystemPathKind): string;
}
