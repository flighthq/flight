import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runToolPipeline } from './pipelineTool';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('runToolPipeline', () => {
  it('prints help successfully and rejects unknown commands at the thin CLI boundary', async () => {
    await expect(run(['--help'])).resolves.toEqual({
      errors: [],
      exitCode: 0,
      output: ['Usage: tool-pipeline build --config <file> --out <new-directory>\n'],
    });
    await expect(run(['transform'])).resolves.toEqual({
      errors: ['Usage: tool-pipeline build --config <file> --out <new-directory>\n'],
      exitCode: 1,
      output: [],
    });
  });

  it('builds from explicit paths and prints only the deterministic manifest identity', async () => {
    const root = await createRoot();
    const configPath = join(root, 'tool-pipeline.json');
    const outputDirectory = join(root, 'out');
    await writeFile(join(root, 'asset.bin'), new Uint8Array([1, 2, 3]));
    await writeFile(
      configPath,
      JSON.stringify({ assets: [{ id: 'asset', source: 'asset.bin', type: 'data' }], schemaVersion: 1 }),
    );

    const result = await run(['build', '--config', configPath, '--out', outputDirectory]);
    const manifest = await readFile(join(outputDirectory, 'asset-manifest.json'));

    expect(result).toEqual({
      errors: [],
      exitCode: 0,
      output: [`sha256-${createHash('sha256').update(manifest).digest('hex')}  asset-manifest.json\n`],
    });
  });

  it('reports config/build failures without publishing a manifest or printing a stack', async () => {
    const root = await createRoot();
    const configPath = join(root, 'tool-pipeline.json');
    const outputDirectory = join(root, 'out');
    await writeFile(configPath, '{"assets":[],"schemaVersion":2}');

    const result = await run(['build', '--config', configPath, '--out', outputDirectory]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toEqual([]);
    expect(result.errors.join('')).toContain('schemaVersion must equal 1');
    expect(result.errors.join('')).not.toContain('\n    at ');
    await expect(readFile(join(outputDirectory, 'asset-manifest.json'))).rejects.toThrow();
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'flight-tool-pipeline-cli-'));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function run(args: readonly string[]): Promise<{ errors: string[]; exitCode: number; output: string[] }> {
  const errors: string[] = [];
  const output: string[] = [];
  const exitCode = await runToolPipeline(args, {
    writeError: (message) => errors.push(message),
    writeOutput: (message) => output.push(message),
  });
  return { errors, exitCode, output };
}
