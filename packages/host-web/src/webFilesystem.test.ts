import { describe, expect, it } from 'vitest';

import { webFileSystemBackend } from './webFilesystem';

describe('webFileSystemBackend', () => {
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
});
