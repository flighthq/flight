import { createFileDialogHandle } from '@flighthq/dialog/contract';
import type { HostFileSystemProvider } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as filesystem from './filesystem';

describe('appendTextFile', () => {
  it('uses the provider on the passed host', async () => {
    const appendTextFile = vi.fn(async () => true);
    await expect(filesystem.appendTextFile(hostWith({ appendTextFile }), 'a', 'b')).resolves.toBe(true);
    expect(appendTextFile).toHaveBeenCalledWith('a', 'b');
  });
});

describe('canAccessFile', () => {
  it('returns false when the provider omits the operation', async () => {
    await expect(filesystem.canAccessFile(hostWith(), 'a', 'readable')).resolves.toBe(false);
  });
});

describe('copyFile', () => {
  it('forwards both paths', async () => {
    const copy = vi.fn(async () => true);
    await filesystem.copyFile(hostWith({ copy }), 'a', 'b');
    expect(copy).toHaveBeenCalledWith('a', 'b');
  });
});

describe('createFileSymlink', () => {
  it('owns the documented absence result outside host providers', async () => {
    await expect(filesystem.createFileSymlink('a', 'b')).resolves.toBe(false);
  });
});

describe('directoryExists', () => {
  it('forwards the path', async () => {
    const directoryExists = vi.fn(async () => true);
    await expect(filesystem.directoryExists(hostWith({ directoryExists }), 'a')).resolves.toBe(true);
  });
});

describe('fileExists', () => {
  it('forwards the path', async () => {
    const fileExists = vi.fn(async () => true);
    await expect(filesystem.fileExists(hostWith({ fileExists }), 'a')).resolves.toBe(true);
  });
});

describe('findFiles', () => {
  it('filters recursive provider entries by glob', async () => {
    const entries = [
      { isDirectory: false, name: 'a.txt', path: 'a.txt' },
      { isDirectory: false, name: 'b.bin', path: 'nested/b.bin' },
    ];
    const host = hostWith({ readDirectoryRecursive: vi.fn(async () => entries) });
    await expect(filesystem.findFiles(host, '', '**/*.bin')).resolves.toEqual([entries[1]]);
  });
});

describe('getFileBaseName', () => {
  it('returns the final path segment', () => expect(filesystem.getFileBaseName('a/b.txt')).toBe('b.txt'));
});

describe('getFileDirectoryName', () => {
  it('returns every segment before the last', () => expect(filesystem.getFileDirectoryName('a/b.txt')).toBe('a'));
});

describe('getFileExtensionName', () => {
  it('returns the final extension', () => expect(filesystem.getFileExtensionName('a/b.txt')).toBe('.txt'));
});

describe('getFilePermissions', () => {
  it('owns the documented absence result', async () => {
    await expect(filesystem.getFilePermissions('a')).resolves.toBe(null);
  });
});

describe('getFileRealPath', () => {
  it('owns the documented absence result', async () => {
    await expect(filesystem.getFileRealPath('a')).resolves.toBe(null);
  });
});

describe('getFileSystemPath', () => {
  it('owns the documented absence result', () => expect(filesystem.getFileSystemPath('home')).toBe(''));
});

describe('getFileSystemUsage', () => {
  it('returns null when the provider omits quota estimation', async () => {
    await expect(filesystem.getFileSystemUsage(hostWith())).resolves.toBe(null);
  });
});

describe('isAbsoluteFilePath', () => {
  it('recognizes POSIX and Windows roots', () => {
    expect(filesystem.isAbsoluteFilePath('/a')).toBe(true);
    expect(filesystem.isAbsoluteFilePath('C:/a')).toBe(true);
    expect(filesystem.isAbsoluteFilePath('a')).toBe(false);
  });
});

describe('joinFilePath', () => {
  it('joins and normalizes separators', () => expect(filesystem.joinFilePath('/a', '.', 'b')).toBe('/a/b'));

  it('resolves a dot-dot segment against the segment before it', () => {
    expect(filesystem.joinFilePath('/a/b', '../c')).toBe('/a/c');
    expect(filesystem.joinFilePath('a', 'b', '..', 'c')).toBe('a/c');
  });

  it('agrees with normalizeFilePath, so a path has one spelling whichever entry point built it', () => {
    // Joining and normalizing must not disagree, or the same file has two names depending on how the
    // caller happened to construct it.
    for (const parts of [
      ['/a/b', '../c'],
      ['a', '..', '..', 'b'],
      ['/a', '..', '..'],
      ['a', '..'],
    ]) {
      expect(filesystem.joinFilePath(...parts)).toBe(filesystem.normalizeFilePath(parts.join('/')));
    }
  });
});

describe('makeDirectory', () => {
  it('returns false when omitted', async () => {
    await expect(filesystem.makeDirectory(hostWith(), 'a')).resolves.toBe(false);
  });
});

describe('normalizeFilePath', () => {
  it('removes empty and dot segments', () => expect(filesystem.normalizeFilePath('/a//./b')).toBe('/a/b'));

  it('resolves a dot-dot segment against the segment before it', () => {
    expect(filesystem.normalizeFilePath('/a/b/../c')).toBe('/a/c');
    expect(filesystem.normalizeFilePath('a/b/../../c')).toBe('c');
    expect(filesystem.normalizeFilePath('/a/b/..')).toBe('/a');
  });

  it('clamps an absolute path at the root, which has nothing above it', () => {
    expect(filesystem.normalizeFilePath('/..')).toBe('/');
    expect(filesystem.normalizeFilePath('/a/../../b')).toBe('/b');
  });

  it('KEEPS a leading dot-dot on a relative path, which still refers to a parent', () => {
    // The direction that matters. Dropping these would not merely lose information: it would rewrite a
    // path that escapes its base into one that appears not to, so a caller checking containment would
    // be told the wrong answer.
    expect(filesystem.normalizeFilePath('..')).toBe('..');
    expect(filesystem.normalizeFilePath('a/../../b')).toBe('../b');
    expect(filesystem.normalizeFilePath('a/../../..')).toBe('../..');
  });

  it('resolves a relative path that cancels out to `.` rather than to the empty string', () => {
    // '' is falsy and concatenates wrongly; '.' says "the directory it started from", which is what the
    // path means.
    expect(filesystem.normalizeFilePath('a/..')).toBe('.');
    expect(filesystem.normalizeFilePath('.')).toBe('.');
  });
});

describe('openFileReadStream', () => {
  it('returns null when omitted', async () => {
    await expect(filesystem.openFileReadStream(hostWith(), 'a')).resolves.toBe(null);
  });
});

describe('openFileWriteStream', () => {
  it('returns null when omitted', async () => {
    await expect(filesystem.openFileWriteStream(hostWith(), 'a')).resolves.toBe(null);
  });
});

describe('readBinaryFile', () => {
  it('preserves provider byte identity', async () => {
    const bytes = new Uint8Array([1, 2]);
    await expect(filesystem.readBinaryFile(hostWith({ readBinaryFile: vi.fn(async () => bytes) }), 'a')).resolves.toBe(
      bytes,
    );
  });

  it('rejects pre-aborted reads without starting provider work', async () => {
    const reason = new Error('cancel read');
    const controller = new AbortController();
    const readBinaryFile = vi.fn(async () => new Uint8Array());
    controller.abort(reason);
    await expect(filesystem.readBinaryFile(hostWith({ readBinaryFile }), 'a', controller.signal)).rejects.toBe(reason);
    expect(readBinaryFile).not.toHaveBeenCalled();
  });
});

describe('readBinaryFileRange', () => {
  it('forwards the range', async () => {
    const readBinaryFileRange = vi.fn(async () => new Uint8Array([2]));
    const signal = new AbortController().signal;
    await filesystem.readBinaryFileRange(hostWith({ readBinaryFileRange }), 'a', 1, 1, signal);
    expect(readBinaryFileRange).toHaveBeenCalledWith('a', 1, 1, signal);
  });
});

describe('readDialogHandleBinaryFile', () => {
  it('uses retained handle operations when there is no native path', async () => {
    const bytes = new Uint8Array([3]);
    let observedSignal: AbortSignal | undefined;
    const handle = createFileDialogHandle('File', 'a', null, {
      readBinary: async (signal?: AbortSignal) => {
        observedSignal = signal;
        return bytes;
      },
      readText: async () => 'x',
      writeBinary: async () => true,
      writeText: async () => true,
    });
    const signal = new AbortController().signal;
    await expect(filesystem.readDialogHandleBinaryFile(hostWith(), handle, signal)).resolves.toBe(bytes);
    expect(observedSignal).toBe(signal);
  });
});

describe('readDialogHandleTextFile', () => {
  it('uses the passed host for a native path', async () => {
    const readTextFile = vi.fn(async () => 'text');
    const handle = createFileDialogHandle('File', 'a', '/a');
    await expect(filesystem.readDialogHandleTextFile(hostWith({ readTextFile }), handle)).resolves.toBe('text');
  });
});

describe('readDirectory', () => {
  it('returns an owned empty result when omitted', async () => {
    await expect(filesystem.readDirectory(hostWith(), 'a')).resolves.toEqual([]);
  });
});

describe('readDirectoryRecursive', () => {
  it('forwards walk options', async () => {
    const readDirectoryRecursive = vi.fn(async () => []);
    await filesystem.readDirectoryRecursive(hostWith({ readDirectoryRecursive }), 'a', { maxDepth: 2 });
    expect(readDirectoryRecursive).toHaveBeenCalledWith('a', { maxDepth: 2 });
  });
});

describe('readFileSymlink', () => {
  it('owns the documented absence result', async () => {
    await expect(filesystem.readFileSymlink('a')).resolves.toBe(null);
  });
});

describe('readTextFile', () => {
  it('never crosses between two explicit hosts', async () => {
    const first = hostWith({ readTextFile: vi.fn(async () => 'first') });
    const second = hostWith({ readTextFile: vi.fn(async () => 'second') });
    await expect(filesystem.readTextFile(first, 'a')).resolves.toBe('first');
    await expect(filesystem.readTextFile(second, 'a')).resolves.toBe('second');
  });
});

describe('removeDirectory', () => {
  it('forwards recursive intent', async () => {
    const removeDirectory = vi.fn(async () => true);
    await filesystem.removeDirectory(hostWith({ removeDirectory }), 'a', true);
    expect(removeDirectory).toHaveBeenCalledWith('a', true);
  });
});

describe('removeFile', () => {
  it('returns false when omitted', async () => {
    await expect(filesystem.removeFile(hostWith(), 'a')).resolves.toBe(false);
  });
});

describe('renameFile', () => {
  it('forwards both paths', async () => {
    const rename = vi.fn(async () => true);
    await filesystem.renameFile(hostWith({ rename }), 'a', 'b');
    expect(rename).toHaveBeenCalledWith('a', 'b');
  });
});

describe('setFilePermissions', () => {
  it('owns the documented absence result', async () => {
    await expect(
      filesystem.setFilePermissions('a', { executable: false, readable: true, writable: true }),
    ).resolves.toBe(false);
  });
});

describe('statFile', () => {
  it('returns null when omitted', async () => {
    await expect(filesystem.statFile(hostWith(), 'a')).resolves.toBe(null);
  });
});

describe('watchPath', () => {
  it('owns an inert unsubscribe when no real provider exists', () => {
    expect(filesystem.watchPath('a', vi.fn())).toBeTypeOf('function');
  });
});

describe('writeBinaryFile', () => {
  it('forwards bytes without mutation', async () => {
    const writeBinaryFile = vi.fn(async () => true);
    const bytes = new Uint8Array([1]);
    const signal = new AbortController().signal;
    await filesystem.writeBinaryFile(hostWith({ writeBinaryFile }), 'a', bytes, signal);
    expect(writeBinaryFile).toHaveBeenCalledWith('a', bytes, signal);
  });
});

describe('writeBinaryFileChunks', () => {
  it('streams each chunk through the explicit provider', async () => {
    const written: number[][] = [];
    const stream = new WritableStream<Uint8Array>({ write: (chunk) => void written.push([...chunk]) });
    const host = hostWith({ openFileWriteStream: vi.fn(async () => stream) });
    async function* chunks() {
      yield new Uint8Array([1]);
      yield new Uint8Array([2]);
    }
    await expect(filesystem.writeBinaryFileChunks(host, 'a', chunks())).resolves.toBe(true);
    expect(written).toEqual([[1], [2]]);
  });

  it('aborts its owned writer, rejects with the abort reason, and removes its listener', async () => {
    const reason = new Error('cancel chunks');
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const abort = vi.fn(async () => {});
    const stream = new WritableStream<Uint8Array>({
      abort,
      async write() {
        controller.abort(reason);
        throw reason;
      },
    });
    const host = hostWith({ openFileWriteStream: vi.fn(async () => stream) });
    async function* chunks() {
      yield new Uint8Array([1]);
    }
    await expect(filesystem.writeBinaryFileChunks(host, 'a', chunks(), controller.signal)).rejects.toBe(reason);
    expect(abort).toHaveBeenCalledWith(reason);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('writeDialogHandleBinaryFile', () => {
  it('returns false for an authority-free handle', async () => {
    const handle = createFileDialogHandle('File', 'a', null);
    await expect(filesystem.writeDialogHandleBinaryFile(hostWith(), handle, new Uint8Array())).resolves.toBe(false);
  });
});

describe('writeDialogHandleTextFile', () => {
  it('uses the passed host for a native path', async () => {
    const writeTextFile = vi.fn(async () => true);
    const handle = createFileDialogHandle('File', 'a', '/a');
    const signal = new AbortController().signal;
    await expect(filesystem.writeDialogHandleTextFile(hostWith({ writeTextFile }), handle, 'x', signal)).resolves.toBe(
      true,
    );
    expect(writeTextFile).toHaveBeenCalledWith('/a', 'x', signal);
  });
});

describe('writeFileAtomic', () => {
  it('returns false when the provider omits atomic writes', async () => {
    await expect(filesystem.writeFileAtomic(hostWith(), 'a', 'x')).resolves.toBe(false);
  });
});

describe('writeTextFile', () => {
  it('forwards path and text', async () => {
    const writeTextFile = vi.fn(async () => true);
    await filesystem.writeTextFile(hostWith({ writeTextFile }), 'a', 'x');
    expect(writeTextFile).toHaveBeenCalledWith('a', 'x');
  });
});

function hostWith(fileSystem: HostFileSystemProvider = {}): HostFileSystemProvider {
  return fileSystem;
}
