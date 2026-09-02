import { describe, expect, it, vi } from 'vitest';

import { webFileSystemBackend } from './webFilesystem';

describe('webFileSystemBackend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes exactly the genuine OPFS operation family', () => {
    expect(Object.keys(webFileSystemBackend).sort()).toEqual([
      'appendTextFile',
      'canAccessFile',
      'copy',
      'directoryExists',
      'fileExists',
      'getFileSystemUsage',
      'makeDirectory',
      'openFileReadStream',
      'openFileWriteStream',
      'readBinaryFile',
      'readBinaryFileRange',
      'readDirectory',
      'readDirectoryRecursive',
      'readTextFile',
      'removeDirectory',
      'removeFile',
      'rename',
      'statFile',
      'writeBinaryFile',
      'writeFileAtomic',
      'writeTextFile',
    ]);
  });

  it('returns domain sentinels when OPFS is unavailable', async () => {
    await expect(webFileSystemBackend.readTextFile?.('a')).resolves.toBe(null);
    await expect(webFileSystemBackend.writeTextFile?.('a', 'b')).resolves.toBe(false);
  });

  it('aborts an in-flight owned writable and releases the signal listener', async () => {
    const reason = new Error('cancel OPFS write');
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const abort = vi.fn(async () => {});
    const writable = {
      abort,
      async close() {},
      async write() {
        controller.abort(reason);
        throw reason;
      },
    };
    vi.stubGlobal('navigator', {
      storage: {
        async getDirectory() {
          return {
            async getFileHandle() {
              return {
                async createWritable() {
                  return writable;
                },
              };
            },
          };
        },
      },
    });

    await expect(webFileSystemBackend.writeTextFile?.('a', 'b', controller.signal)).rejects.toBe(reason);
    expect(abort).toHaveBeenCalledWith(reason);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('stops an in-flight recursive directory walk', async () => {
    const reason = new Error('cancel OPFS walk');
    const controller = new AbortController();
    vi.stubGlobal('navigator', {
      storage: {
        async getDirectory() {
          return {
            async *entries() {
              controller.abort(reason);
              yield ['ignored', { kind: 'file' }];
            },
          };
        },
      },
    });

    await expect(webFileSystemBackend.readDirectoryRecursive?.('', { signal: controller.signal })).rejects.toBe(reason);
  });

  it('does not let a late abort rewrite a completed write', async () => {
    const controller = new AbortController();
    const abort = vi.fn(async () => {});
    const writable = { abort, async close() {}, async write() {} };
    vi.stubGlobal('navigator', {
      storage: {
        async getDirectory() {
          return {
            async getFileHandle() {
              return {
                async createWritable() {
                  return writable;
                },
              };
            },
          };
        },
      },
    });

    await expect(webFileSystemBackend.writeTextFile?.('a', 'b', controller.signal)).resolves.toBe(true);
    controller.abort(new Error('too late'));
    expect(abort).not.toHaveBeenCalled();
  });
});
