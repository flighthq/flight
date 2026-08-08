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
import { isImportConformancePackFileReference } from './import-conformance-case';
import {
  buildImportConformanceCapabilityIndex,
  parseImportConformanceCapabilityDefinitions,
} from './import-conformance-core';
import type { ImportConformanceCapabilityIndex } from './import-conformance-core';
import type {
  ImportConformanceImporterDeclaredCensus,
  ImportConformanceIndividuationMargin,
  ImportConformanceScoreDeclarations,
} from './import-conformance-core';
import { probeSwfCapabilities } from './swf-capability-probe';

export const SWF_CAPABILITY_CONVENTION_REVISION = 'unresolved-individuation-v1';
export const SWF_IMPORTER_DECLARED_CENSUS = {
  basis: 'single-artifact-cross-check',
  candidateHits: 5,
  falsePositiveHits: 3,
  provenance: 'single-author',
  reference: 'capabilities.json-vs-tag-coverage.md',
  state: 'provisional',
} as const satisfies ImportConformanceImporterDeclaredCensus;
export const SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN = {
  behaviorPreservingRefactorRows: 77,
  discriminatedSourceRows: 80,
  frozenDeclaredRows: 82,
  rejectedCircularCandidate: 'corpus-differential-behavior',
  sameDispatchArmRows: 66,
  state: 'frozen-no-election',
} as const satisfies ImportConformanceIndividuationMargin;
export const SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS = {
  configurationLimits: [
    {
      capabilityIds: ['swf.button.define-button', 'swf.button.define-button-2'],
      id: 'MAX_BUTTON_RECORDS',
      reporting: 'unobservable',
    },
    {
      capabilityIds: ['swf.script.do-action', 'swf.script.do-init-action'],
      id: 'MAX_FRAME_ACTIONS',
      reporting: 'unobservable',
    },
    {
      capabilityIds: ['swf.text.define-text', 'swf.text.define-text-2'],
      id: 'MAX_TEXT_RECORDS',
      reporting: 'unobservable',
    },
  ],
  // Audited reachable loss families are added only from builder2's settled capability-keyed site list.
  unwiredLossFamilies: [],
} as const satisfies ImportConformanceScoreDeclarations['capabilityScopedUnknownMappings'];

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
        members: [{ reference, role: 'source', sourceHash: createHash('sha256').update(bytes).digest('hex') }],
        probeState: probe.readable ? ('readable' as const) : ('unreadable' as const),
        reference,
      };
    },
  );
  return buildImportConformanceCapabilityIndex(
    {
      capabilityConventionRevision: SWF_CAPABILITY_CONVENTION_REVISION,
      id: PACK_ID,
      release: FIXTURE_RELEASE_TAG,
      variant: PACK_VARIANT,
    },
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
  const index = await buildSwfCapabilityIndex(treeDirectory, definitions, pack.verifiedFixtureFiles);
  const output = join(REPOSITORY_ROOT, '.artifacts', 'import-conformance', 'index.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(index, null, 2)}\n`);
  const exercised = index.capabilities.filter((capability) => capability.witnesses.length > 0);
  const singles = exercised.filter((capability) => capability.witnesses.length === 1);
  process.stdout.write(
    `Indexed ${index.inventory.indexedCases} SWFs from ${index.inventory.corpusFiles} corpus files; ${index.inventory.unreadableCases} unreadable.\n` +
      `Exercised importer-declared capability rows ${exercised.length}; declared capability row tally ${index.capabilities.length}; ${singles.length} single-witness capabilities.\n` +
      `Capability convention revision ${index.pack.capabilityConventionRevision}; importer-declared capability denominator UNRESOLVED.\n` +
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
const SWF_FIXTURE_PACK_FILE_POLICY = {
  excludedPathSegments: new Set(['LICENSES']),
  extensions: ['.swf'],
  rootMetadataReferences: ROOT_METADATA_NAMES,
} as const;

export function isImportConformanceFixtureReference(reference: string): boolean {
  return isImportConformancePackFileReference(reference, SWF_FIXTURE_PACK_FILE_POLICY);
}
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  main().catch((error: unknown) => {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
