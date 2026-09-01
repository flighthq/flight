import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildToolPipeline } from './pipelineBuild';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('buildToolPipeline', () => {
  it('publishes exact source bytes at their full SHA-256 URL with a canonical manifest', async () => {
    const root = await createRoot();
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const configPath = await writeConfig(root, {
      assets: [{ groups: ['boot'], id: 'hero', source: 'images/hero.PNG', type: 'image' }],
      schemaVersion: 1,
    });
    await writeBytes(join(root, 'images', 'hero.PNG'), bytes);
    const outputDirectory = join(root, 'out');

    const result = await buildToolPipeline({ configPath, outputDirectory });

    const contentHash = `sha256-${sha256(bytes)}`;
    const assetUrl = `assets/${contentHash}.png`;
    const expectedManifest = {
      assets: [{ byteLength: 4, contentHash, groups: ['boot'], id: 'hero', type: 'image', url: assetUrl }],
      schemaVersion: 1,
    };
    const expectedText = `${JSON.stringify(expectedManifest, null, 2)}\n`;
    expect(result).toEqual({
      manifest: expectedManifest,
      manifestHash: `sha256-${sha256(expectedText)}`,
      outputFiles: ['asset-manifest.json', assetUrl],
    });
    expect(await readFile(join(outputDirectory, assetUrl))).toEqual(Buffer.from(bytes));
    expect(await readFile(join(outputDirectory, 'asset-manifest.json'), 'utf8')).toBe(expectedText);
  });

  it('is byte-identical across config order, group order, roots, and mtimes with explicit code-unit sorting', async () => {
    const first = await createDeterminismFixture(false, new Date(1_000));
    const second = await createDeterminismFixture(true, new Date(9_000_000));

    const firstResult = await buildToolPipeline(first);
    const secondResult = await buildToolPipeline(second);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.manifest.assets.map((asset) => asset.id)).toEqual(['Z', 'a', 'ä']);
    expect(firstResult.manifest.assets.find((asset) => asset.id === 'a')?.groups).toEqual(['alpha', 'zeta']);
    expect(await readFile(join(first.outputDirectory, 'asset-manifest.json'))).toEqual(
      await readFile(join(second.outputDirectory, 'asset-manifest.json')),
    );
    for (const file of firstResult.outputFiles.filter((path) => path !== 'asset-manifest.json')) {
      expect(await readFile(join(first.outputDirectory, file))).toEqual(
        await readFile(join(second.outputDirectory, file)),
      );
    }
  });

  it('changes only the affected artifact identity and manifest hash when one source byte changes', async () => {
    const first = await createChangeFixture(2);
    const second = await createChangeFixture(3);
    const firstResult = await buildToolPipeline(first);
    const secondResult = await buildToolPipeline(second);
    const firstStable = firstResult.manifest.assets.find((asset) => asset.id === 'stable');
    const secondStable = secondResult.manifest.assets.find((asset) => asset.id === 'stable');
    const firstChanged = firstResult.manifest.assets.find((asset) => asset.id === 'changed');
    const secondChanged = secondResult.manifest.assets.find((asset) => asset.id === 'changed');

    expect(firstStable).toEqual(secondStable);
    expect(firstChanged?.url).not.toBe(secondChanged?.url);
    expect(firstChanged?.contentHash).not.toBe(secondChanged?.contentHash);
    expect(firstResult.manifestHash).not.toBe(secondResult.manifestHash);
  });

  it('deduplicates equal bytes with equal normalized extensions while retaining both manifest IDs', async () => {
    const root = await createRoot();
    const bytes = new Uint8Array([4, 5, 6]);
    const configPath = await writeConfig(root, {
      assets: [
        { id: 'first', source: 'first.png', type: 'image' },
        { id: 'second', source: 'second.PNG', type: 'image' },
      ],
      schemaVersion: 1,
    });
    await writeBytes(join(root, 'first.png'), bytes);
    await writeBytes(join(root, 'second.PNG'), bytes);

    const result = await buildToolPipeline({ configPath, outputDirectory: join(root, 'out') });

    expect(result.manifest.assets).toHaveLength(2);
    expect(result.manifest.assets[0]?.url).toBe(result.manifest.assets[1]?.url);
    expect(result.outputFiles).toHaveLength(2);
  });

  it('does not publish an output directory when a later source cannot be read', async () => {
    const root = await createRoot();
    const configPath = await writeConfig(root, {
      assets: [
        { id: 'first', source: 'first.bin', type: 'data' },
        { id: 'missing', source: 'missing.bin', type: 'data' },
      ],
      schemaVersion: 1,
    });
    await writeBytes(join(root, 'first.bin'), new Uint8Array([1]));
    const outputDirectory = join(root, 'out');

    await expect(buildToolPipeline({ configPath, outputDirectory })).rejects.toThrow('missing.bin');
    await expect(access(outputDirectory)).rejects.toThrow();
  });

  it('rejects an existing output directory without changing it', async () => {
    const root = await createRoot();
    const configPath = await writeConfig(root, {
      assets: [{ id: 'asset', source: 'asset.bin', type: 'data' }],
      schemaVersion: 1,
    });
    await writeBytes(join(root, 'asset.bin'), new Uint8Array([1]));
    const outputDirectory = join(root, 'out');
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, 'sentinel.txt'), 'keep');

    await expect(buildToolPipeline({ configPath, outputDirectory })).rejects.toThrow('output directory already exists');
    expect(await readFile(join(outputDirectory, 'sentinel.txt'), 'utf8')).toBe('keep');
    await expect(access(join(outputDirectory, 'asset-manifest.json'))).rejects.toThrow();
  });
});

async function createChangeFixture(changedByte: number): Promise<{ configPath: string; outputDirectory: string }> {
  const root = await createRoot();
  const configPath = await writeConfig(root, {
    assets: [
      { id: 'stable', source: 'stable.bin', type: 'data' },
      { id: 'changed', source: 'changed.bin', type: 'data' },
    ],
    schemaVersion: 1,
  });
  await writeBytes(join(root, 'stable.bin'), new Uint8Array([1]));
  await writeBytes(join(root, 'changed.bin'), new Uint8Array([changedByte]));
  return { configPath, outputDirectory: join(root, 'out') };
}

async function createDeterminismFixture(
  reverse: boolean,
  mtime: Date,
): Promise<{ configPath: string; outputDirectory: string }> {
  const root = await createRoot();
  const assets = [
    { id: 'ä', source: 'images/umlaut.PNG', type: 'image' },
    { groups: reverse ? ['alpha', 'zeta'] : ['zeta', 'alpha', 'zeta'], id: 'a', source: 'data/a.bin', type: 'data' },
    { id: 'Z', source: 'data/z.bin', type: 'data' },
  ];
  const configPath = await writeConfig(root, { assets: reverse ? [...assets].reverse() : assets, schemaVersion: 1 });
  for (const [source, bytes] of [
    ['images/umlaut.PNG', new Uint8Array([9, 8, 7])],
    ['data/a.bin', new Uint8Array([1, 2])],
    ['data/z.bin', new Uint8Array([3, 4])],
  ] as const) {
    const path = join(root, ...source.split('/'));
    await writeBytes(path, bytes);
    await utimes(path, mtime, mtime);
  }
  return { configPath, outputDirectory: join(root, 'out') };
}

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'flight-tool-pipeline-'));
  roots.push(root);
  return root;
}

function sha256(value: string | Readonly<Uint8Array>): string {
  return createHash('sha256').update(value).digest('hex');
}

async function writeBytes(path: string, bytes: Readonly<Uint8Array>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function writeConfig(root: string, config: unknown): Promise<string> {
  const path = join(root, 'tool-pipeline.json');
  await writeFile(path, JSON.stringify(config));
  return path;
}
