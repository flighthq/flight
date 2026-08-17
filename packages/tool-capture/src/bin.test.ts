import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPTURE_CLI_BOOLEAN_OPTIONS, CAPTURE_CLI_OPTION_GROUPS } from './captureCliOptions';

const ROOT = dirname(fileURLToPath(import.meta.url));

describe('tool-capture CLI', () => {
  it('publishes the default timeout evidence and the known load-sensitive tail', () => {
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), join(ROOT, 'bin.ts')], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('default 45000');
    expect(result.stderr).toContain('one contended SwiftShader host');
    expect(result.stderr).toContain('env-ibl/webgpu');
    expect(result.stderr).toContain('env-skybox/webgpu');
    expect(result.stderr).toContain('material-blend-modes/webgl');
    expect(result.stderr).toContain('effect-chain/webgpu');
    expect(result.stderr).toContain('Three same-scene siblings were healthy and merely withheld');
  }, 15_000);

  it('keeps each declared option group exact to the bin functions that read it', () => {
    const source = readFileSync(join(ROOT, 'bin.ts'), 'utf8');
    expect(readOptions(source, 'main')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.common]);
    expect(readOptions(source, 'observe')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.observe].sort());
    expect(readOptions(source, 'resolveCaptureCliSuite')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.suite].sort());
    expect(readOptions(source, 'captureOptions')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.capture].sort());
    expect(readOptions(source, 'captureWorkerCount')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.parallel]);
    expect(readOptions(source, 'validationOptions')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.validation].sort());
    expect(readOptions(source, 'benchmarkOptions')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.benchmark].sort());
    expect(readOptions(source, 'batch')).toEqual([...CAPTURE_CLI_OPTION_GROUPS.batch, 'out', 'root'].sort());
    expect(
      readOptionsFromFunctions(
        source,
        [
          'main',
          'observe',
          'resolveCaptureCliSuite',
          'captureOptions',
          'captureWorkerCount',
          'validationOptions',
          'benchmarkOptions',
          'batch',
        ],
        'hasFlag',
      ),
    ).toEqual([...CAPTURE_CLI_BOOLEAN_OPTIONS].sort());
  });

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
      expect(result.stderr).toContain('unknown option for batch: --fail-on-chagned');
      expect(result.stderr).not.toContain('ENOENT');
    } finally {
      rmSync(directory, { recursive: true });
    }
  }, 15_000);
});

function readOptions(source: string, functionName: string): string[] {
  const body = readFunctionBody(source, functionName);
  return [...new Set([...body.matchAll(/(?:flag|hasFlag)\(argv, '([^']+)'\)/g)].map((match) => match[1]!))].sort();
}

function readOptionsFromFunctions(source: string, functionNames: string[], reader: 'flag' | 'hasFlag'): string[] {
  return [
    ...new Set(
      functionNames.flatMap((functionName) =>
        [...readFunctionBody(source, functionName).matchAll(new RegExp(`${reader}\\(argv, '([^']+)'\\)`, 'g'))].map(
          (match) => match[1]!,
        ),
      ),
    ),
  ].sort();
}

function readFunctionBody(source: string, functionName: string): string {
  const signature = new RegExp(`(?:async )?function ${functionName}\\(`).exec(source);
  if (signature === null) throw new Error(`function ${functionName} not found`);
  const start = source.indexOf('{', signature.index);
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(start + 1, index);
  }
  throw new Error(`function ${functionName} has no closing brace`);
}
