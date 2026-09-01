import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { AssetType } from '@flighthq/types/contract';

import { parseToolPipelineConfig } from './pipelineConfig';
import type { ToolPipelineSource } from './pipelineConfig';

export const TOOL_PIPELINE_MANIFEST_SCHEMA_VERSION = 1;

export interface ToolPipelineBuildOptions {
  readonly configPath: string;
  readonly outputDirectory: string;
}

export interface ToolPipelineBuildResult {
  readonly manifest: Readonly<ToolPipelineManifest>;
  readonly manifestHash: string;
  readonly outputFiles: readonly string[];
}

export interface ToolPipelineManifest {
  readonly assets: readonly Readonly<ToolPipelineManifestAsset>[];
  readonly schemaVersion: 1;
}

export interface ToolPipelineManifestAsset {
  readonly byteLength: number;
  readonly contentHash: string;
  readonly groups?: readonly string[];
  readonly id: string;
  readonly type: AssetType;
  readonly url: string;
}

export async function buildToolPipeline(options: Readonly<ToolPipelineBuildOptions>): Promise<ToolPipelineBuildResult> {
  const configPath = resolve(options.configPath);
  const outputDirectory = resolve(options.outputDirectory);
  if (await pathExists(outputDirectory)) {
    throw new Error(`tool-pipeline: output directory already exists: ${outputDirectory}`);
  }

  const config = parseToolPipelineConfig(await readFile(configPath, 'utf8'), configPath);
  const configDirectory = dirname(configPath);
  const outputByUrl = new Map<string, Buffer>();
  const manifestAssets: ToolPipelineManifestAsset[] = [];
  for (const source of [...config.assets].sort((a, b) => compareCodeUnits(a.id, b.id))) {
    const bytes = await readFile(resolve(configDirectory, ...source.source.split('/')));
    const contentHash = `sha256-${hashBytes(bytes)}`;
    const url = `assets/${contentHash}${getNormalizedExtension(source.source)}`;
    outputByUrl.set(url, bytes);
    manifestAssets.push(createManifestAsset(source, bytes.byteLength, contentHash, url));
  }

  const manifest: ToolPipelineManifest = {
    assets: manifestAssets,
    schemaVersion: TOOL_PIPELINE_MANIFEST_SCHEMA_VERSION,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = `sha256-${hashBytes(Buffer.from(manifestText, 'utf8'))}`;
  const outputFiles = ['asset-manifest.json', ...outputByUrl.keys()].sort(compareCodeUnits);

  await publishToolPipelineOutput(outputDirectory, outputByUrl, manifestText);
  return { manifest, manifestHash, outputFiles };
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function createManifestAsset(
  source: Readonly<ToolPipelineSource>,
  byteLength: number,
  contentHash: string,
  url: string,
): ToolPipelineManifestAsset {
  return {
    byteLength,
    contentHash,
    ...(source.groups === undefined ? {} : { groups: [...source.groups] }),
    id: source.id,
    type: source.type,
    url,
  };
}

function getNormalizedExtension(source: string): string {
  const name = source.slice(source.lastIndexOf('/') + 1);
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1];
  return extension === undefined ? '' : `.${extension.toLowerCase()}`;
}

function hashBytes(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function publishToolPipelineOutput(
  outputDirectory: string,
  outputByUrl: ReadonlyMap<string, Buffer>,
  manifestText: string,
): Promise<void> {
  const parent = dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const stagingDirectory = await mkdtemp(join(parent, `.${basename(outputDirectory)}.tmp-`));
  let published = false;
  try {
    for (const [url, bytes] of [...outputByUrl.entries()].sort((a, b) => compareCodeUnits(a[0], b[0]))) {
      const path = join(stagingDirectory, ...url.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    await writeFile(join(stagingDirectory, 'asset-manifest.json'), manifestText, 'utf8');
    if (await pathExists(outputDirectory)) {
      throw new Error(`tool-pipeline: output directory already exists: ${outputDirectory}`);
    }
    await rename(stagingDirectory, outputDirectory);
    published = true;
  } finally {
    if (!published) await rm(stagingDirectory, { force: true, recursive: true });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
