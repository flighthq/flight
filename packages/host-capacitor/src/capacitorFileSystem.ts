import { createEntity } from '@flighthq/entity/contract';
import type { CapacitorApi, Entity, FileEntry, FileStat, FileSystemBasicBackend } from '@flighthq/types/contract';

// Maps Flight's honest FileSystemHostBackend onto Capacitor's async `@capacitor/filesystem`. Both sides are
// Promise-based, so the core surface maps cleanly: text via the `utf8` encoding, binary via Base64
// (Capacitor omits `encoding` for binary and crosses bytes as a Base64 string), plus
// exists/remove/mkdir/readdir/stat/rename/copy/append. Reads resolve to null / [] and writes to false on
// failure instead of throwing, per the contract. Paths are forwarded as-is: the caller supplies a
// Capacitor-resolvable path (a `file://` URI, or a path the host's default Directory resolves).
//
// Operations the plugin cannot perform are absent from the returned provider.
export function createCapacitorFileSystemBackend(capacitor: CapacitorApi): FileSystemBasicBackend & Entity {
  const filesystem = capacitor.filesystem;
  return createEntity({
    async readTextFile(path) {
      try {
        return readResultAsText((await filesystem.readFile({ path, encoding: 'utf8' })).data);
      } catch {
        return null;
      }
    },
    async writeTextFile(path, data) {
      try {
        await filesystem.writeFile({ path, data, encoding: 'utf8', recursive: true });
        return true;
      } catch {
        return false;
      }
    },
    async readBinaryFile(path) {
      try {
        return readResultAsBytes((await filesystem.readFile({ path })).data);
      } catch {
        return null;
      }
    },
    async writeBinaryFile(path, data) {
      try {
        await filesystem.writeFile({ path, data: bytesToBase64(data), recursive: true });
        return true;
      } catch {
        return false;
      }
    },
    async fileExists(path) {
      try {
        return (await filesystem.stat({ path })).type !== 'directory';
      } catch {
        return false;
      }
    },
    async directoryExists(path) {
      try {
        return (await filesystem.stat({ path })).type === 'directory';
      } catch {
        return false;
      }
    },
    async removeFile(path) {
      try {
        await filesystem.deleteFile({ path });
        return true;
      } catch {
        return false;
      }
    },
    async removeDirectory(path, recursive) {
      try {
        await filesystem.rmdir({ path, recursive: recursive ?? false });
        return true;
      } catch {
        return false;
      }
    },
    async makeDirectory(path) {
      try {
        await filesystem.mkdir({ path, recursive: true });
        return true;
      } catch {
        return false;
      }
    },
    async readDirectory(path) {
      try {
        return (await filesystem.readdir({ path })).files.map((file) => toFileEntry(file.name, file.uri, file.type));
      } catch {
        return [];
      }
    },
    async statFile(path) {
      try {
        const stat = await filesystem.stat({ path });
        const out: FileStat = {
          size: stat.size,
          isDirectory: stat.type === 'directory',
          modifiedTime: stat.mtime,
          createdTime: stat.ctime ?? stat.mtime,
          isSymlink: false,
        };
        return out;
      } catch {
        return null;
      }
    },
    async rename(from, to) {
      try {
        await filesystem.rename({ from, to });
        return true;
      } catch {
        return false;
      }
    },
    async copy(from, to) {
      try {
        await filesystem.copy({ from, to });
        return true;
      } catch {
        return false;
      }
    },
    async appendTextFile(path, data) {
      try {
        await filesystem.appendFile({ path, data, encoding: 'utf8' });
        return true;
      } catch {
        return false;
      }
    },
  } satisfies FileSystemBasicBackend);
}

function toFileEntry(name: string, path: string, type: string): FileEntry {
  return { name, path, isDirectory: type === 'directory' };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readResultAsText(data: Blob | string): Promise<string> {
  return typeof data === 'string' ? data : data.text();
}

async function readResultAsBytes(data: Blob | string): Promise<Uint8Array> {
  return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
}

function bytesToBase64(bytes: Readonly<Uint8Array>): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
