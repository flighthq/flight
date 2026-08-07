import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIXTURE_RELEASE_TAG,
  getFixtureTreePath,
  readFixtureTreeStamp,
  resolveFixtureCacheDirectory,
} from './fixtures';
import {
  buildImportConformanceCapabilityIndex,
  isImportConformanceFixtureReference,
  parseImportConformanceCapabilityDefinitions,
} from './import-conformance-core';
import type { ImportConformanceCapabilityIndex } from './import-conformance-core';
import { probeSwfCapabilities } from './swf-capability-probe';

export interface ImportConformanceCorpusInventory {
  corpusFiles: number;
  swfReferences: string[];
}

export async function buildSwfCapabilityIndex(
  treeDirectory: string,
  definitions: ReturnType<typeof parseImportConformanceCapabilityDefinitions>,
  expectedCorpusFiles: number,
): Promise<ImportConformanceCapabilityIndex> {
  const inventory = inventoryImportConformanceCorpus(treeDirectory);
  if (inventory.corpusFiles !== expectedCorpusFiles) {
    throw new Error(
      `Fixture tree is incomplete: expected ${expectedCorpusFiles} corpus files, found ${inventory.corpusFiles}`,
    );
  }
  const evidence = await mapWithConcurrency(
    inventory.swfReferences,
    Math.max(1, availableParallelism()),
    async (reference) => {
      const bytes = await readFile(join(treeDirectory, ...reference.split('/')));
      const probe = probeSwfCapabilities(bytes);
      return {
        capabilities: probe.capabilities,
        probeState: probe.readable ? ('readable' as const) : ('unreadable' as const),
        reference,
        sourceHash: createHash('sha256').update(bytes).digest('hex'),
      };
    },
  );
  return buildImportConformanceCapabilityIndex(
    { id: PACK_ID, release: FIXTURE_RELEASE_TAG, variant: PACK_VARIANT },
    definitions,
    evidence,
    inventory.corpusFiles,
  );
}

export function inventoryImportConformanceCorpus(treeDirectory: string): ImportConformanceCorpusInventory {
  const files: string[] = [];
  const pending = [treeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const reference = relative(treeDirectory, path).split(sep).join('/');
      if (reference.split('/').includes('LICENSES')) continue;
      if (!reference.includes('/') && ROOT_METADATA_NAMES.has(reference)) continue;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(reference);
    }
  }
  files.sort();
  return {
    corpusFiles: files.length,
    swfReferences: files.filter(isImportConformanceFixtureReference),
  };
}

async function main(): Promise<void> {
  const cacheDirectory = resolveFixtureCacheDirectory();
  const treeDirectory = getFixtureTreePath(cacheDirectory, PACK_VARIANT, PACK_ID);
  const stamp = readFixtureTreeStamp(treeDirectory);
  const pack = stamp?.packs.find((candidate) => candidate.pack === PACK_ID);
  if (stamp === null || pack === undefined || stamp.tag !== FIXTURE_RELEASE_TAG || stamp.variant !== PACK_VARIANT) {
    throw new Error(
      `Verified ${PACK_ID} ${PACK_VARIANT} tree is unavailable; run npm run fixtures -- ${PACK_ID} --variant ${PACK_VARIANT}`,
    );
  }
  const definitions = parseImportConformanceCapabilityDefinitions(
    JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'agents', 'packages', 'swf', 'capabilities.json'), 'utf8')),
  );
  const index = await buildSwfCapabilityIndex(treeDirectory, definitions, pack.files);
  const output = join(REPOSITORY_ROOT, '.artifacts', 'import-conformance', 'index.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(index, null, 2)}\n`);
  const exercised = index.capabilities.filter((capability) => capability.witnesses.length > 0);
  const singles = exercised.filter((capability) => capability.witnesses.length === 1);
  process.stdout.write(
    `Indexed ${index.inventory.indexedSwfFiles} SWFs from ${index.inventory.corpusFiles} corpus files; ${index.inventory.unreadableSwfFiles} unreadable.\n` +
      `Evidence ${exercised.length}/${index.capabilities.length}; ${singles.length} single-witness capabilities.\n` +
      `Wrote ${output}\n`,
  );
}

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  map: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const outputs = new Array<Output>(inputs.length);
  let next = 0;
  async function work(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= inputs.length) return;
      outputs[index] = await map(inputs[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, work));
  return outputs;
}

const PACK_ID = 'swf-ruffle-fixtures';
const PACK_VARIANT = 'full';
const ROOT_METADATA_NAMES = new Set(['.flight-fixtures.json', 'NOTICE.md', 'README.md', 'manifest.json']);
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  main().catch((error: unknown) => {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
