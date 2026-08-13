import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

describe('tool-capture CLI', () => {
  it('rejects a misspelled gate option before performing command work', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tool-capture-cli-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          require.resolve('tsx/cli'),
          join(ROOT, 'bin.ts'),
          'batch',
          `--config=${join(directory, 'missing.json')}`,
          '--fail-on-chagned',
        ],
        { encoding: 'utf8', timeout: 10_000 },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown option --fail-on-chagned');
      expect(result.stderr).not.toContain('ENOENT');
    } finally {
      rmSync(directory, { recursive: true });
    }
  }, 15_000);
});
