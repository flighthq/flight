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

// File system seam. Free functions in @flighthq/filesystem delegate to the active backend (web OPFS
// default or a native host's). Reads resolve to null / [], writes to false when the host lacks access
// or the entry is missing, rather than throwing — absent files are an expected outcome, not an error.
export interface FileSystemBackend {
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, data: string): Promise<boolean>;
  readBinaryFile(path: string): Promise<Uint8Array | null>;
  writeBinaryFile(path: string, data: Readonly<Uint8Array>): Promise<boolean>;
  fileExists(path: string): Promise<boolean>;
  removeFile(path: string): Promise<boolean>;
  makeDirectory(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<FileEntry[]>;
  statFile(path: string): Promise<FileStat | null>;
  rename(from: string, to: string): Promise<boolean>;
  copy(from: string, to: string): Promise<boolean>;
  appendTextFile(path: string, data: string): Promise<boolean>;
  // Returns an unsubscribe function; native hosts deliver change events, web returns a no-op.
  watch(path: string, listener: (event: Readonly<FileWatchEvent>) => void): () => void;
  getPath(kind: FileSystemPathKind): string;
}
