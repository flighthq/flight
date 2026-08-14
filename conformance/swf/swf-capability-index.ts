import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FixtureTreeStampPack } from '../../scripts/fixtures';
import {
  FIXTURE_RELEASE_TAG,
  getFixtureTreePath,
  readFixtureTreeStamp,
  resolveFixtureCacheDirectory,
} from '../../scripts/fixtures';
import { isImportConformancePackFileReference } from '../core/import-conformance-case';
import {
  buildImportConformanceCapabilityIndex,
  parseImportConformanceCapabilityDefinitions,
} from '../core/import-conformance-core';
import type { ImportConformanceCapabilityIndex } from '../core/import-conformance-core';
import type { ImportConformanceScoreDeclarations } from '../core/import-conformance-core';
import type { ImportConformanceDenominators } from '../core/import-conformance-denominator';
import { probeSwfCapabilities } from './swf-capability-probe';

export const SWF_CAPABILITY_CONVENTION_REVISION = 'unresolved-individuation-v1';
export const SWF_IMPORTER_DECLARED_CENSUS = {
  basis: 'single-artifact-cross-check',
  candidateHits: 5,
  falsePositiveHits: 3,
  provenance: 'single-author',
  reference: 'capabilities.json-vs-tag-coverage.md',
  state: 'provisional',
} as const;
export const SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN = {
  behaviorPreservingRefactorRows: 77,
  discriminatedSourceRows: 80,
  frozenDeclaredRows: 82,
  rejectedCircularCandidate: 'corpus-differential-behavior',
  sameDispatchArmRows: 66,
  state: 'frozen-no-election',
} as const;
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

interface SwfImporterDeclaredCensus {
  basis: 'single-artifact-cross-check';
  candidateHits: number;
  falsePositiveHits: number;
  provenance: 'single-author';
  reference: string;
  state: 'provisional';
}

interface SwfImporterDeclaredIndividuationMargin {
  behaviorPreservingRefactorRows: number;
  discriminatedSourceRows: number;
  frozenDeclaredRows: number;
  rejectedCircularCandidate: 'corpus-differential-behavior';
  sameDispatchArmRows: number;
  state: 'frozen-no-election';
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

export function createSwfImportConformanceDenominators(
  declaredRows: number,
  census: Readonly<SwfImporterDeclaredCensus> = SWF_IMPORTER_DECLARED_CENSUS,
  margin: Readonly<SwfImporterDeclaredIndividuationMargin> = SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
): ImportConformanceDenominators {
  if (
    census.basis !== 'single-artifact-cross-check' ||
    census.provenance !== 'single-author' ||
    census.state !== 'provisional' ||
    census.reference.trim() === '' ||
    !Number.isSafeInteger(census.candidateHits) ||
    census.candidateHits < 0 ||
    !Number.isSafeInteger(census.falsePositiveHits) ||
    census.falsePositiveHits < 0 ||
    census.falsePositiveHits > census.candidateHits
  ) {
    throw new Error('Invalid SWF importer-declared census');
  }
  if (
    margin.state !== 'frozen-no-election' ||
    margin.rejectedCircularCandidate !== 'corpus-differential-behavior' ||
    margin.frozenDeclaredRows !== declaredRows ||
    !Number.isSafeInteger(declaredRows) ||
    declaredRows < 1 ||
    !Number.isSafeInteger(margin.behaviorPreservingRefactorRows) ||
    margin.behaviorPreservingRefactorRows < 0 ||
    !Number.isSafeInteger(margin.discriminatedSourceRows) ||
    margin.discriminatedSourceRows < 0 ||
    !Number.isSafeInteger(margin.sameDispatchArmRows) ||
    margin.sameDispatchArmRows < 0
  ) {
    throw new Error('Invalid SWF importer-declared individuation margin');
  }
  const censusReference = census.reference;
  return {
    format: {
      format: 'swf',
      reason: 'format-capability-enumeration-not-declared',
      state: 'unmeasured',
    },
    producerDeclared: {
      declaredRows,
      limitation: 'individuation-rule-not-operational',
      methodology: SWF_CAPABILITY_CONVENTION_REVISION,
      readings: [
        { id: 'behavior-preserving-refactor-rows', value: margin.behaviorPreservingRefactorRows },
        { id: 'candidate-hits', reference: censusReference, value: census.candidateHits },
        { id: 'census-basis', reference: censusReference, value: census.basis },
        { id: 'census-provenance', reference: censusReference, value: census.provenance },
        { id: 'census-state', reference: censusReference, value: census.state },
        { id: 'discriminated-source-rows', value: margin.discriminatedSourceRows },
        { id: 'false-positive-hits', reference: censusReference, value: census.falsePositiveHits },
        { id: 'frozen-declared-rows', value: margin.frozenDeclaredRows },
        { id: 'individuation-state', value: margin.state },
        { id: 'rejected-circular-candidate', value: margin.rejectedCircularCandidate },
        { id: 'same-dispatch-arm-rows', value: margin.sameDispatchArmRows },
      ],
      state: 'unresolved',
    },
  };
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

// The pack entry proving this tree is the pinned release, or null when it is not: no stamp, no entry for
// this pack, or a stamp naming a different tag or variant. All four are one outcome — the tree cannot be
// used as evidence — so there is one message rather than four, and a caller that only needs the yes/no
// never pays for the distinction.
//
// Separated from `main` because the decision is the whole subject of the CLI's accept and reject
// behaviour, and it is a pure function of the stamp on disk: no argv, no exit code, no stdout. Fusing it
// into `main` left it reachable only by running the program, which verifies the decision and the process
// together and cannot say which of the two a failure came from.
export function resolveVerifiedSwfFixturePack(treeDirectory: string): FixtureTreeStampPack | null {
  const stamp = readFixtureTreeStamp(treeDirectory);
  if (stamp === null || stamp.tag !== FIXTURE_RELEASE_TAG || stamp.variant !== PACK_VARIANT) return null;
  return stamp.packs.find((candidate) => candidate.pack === PACK_ID) ?? null;
}

async function main(): Promise<void> {
  const cacheDirectory = resolveFixtureCacheDirectory();
  const treeDirectory = getFixtureTreePath(cacheDirectory, PACK_VARIANT, PACK_ID);
  const pack = resolveVerifiedSwfFixturePack(treeDirectory);
  if (pack === null) throw new Error(UNVERIFIED_SWF_FIXTURE_TREE_MESSAGE);
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

// The one thing a caller can do about any of the four unverified cases, which is why they share a
// message: fetch the pinned tree.
export const UNVERIFIED_SWF_FIXTURE_TREE_MESSAGE =
  'Verified swf-ruffle-fixtures full tree is unavailable; run npm run fixtures -- swf-ruffle-fixtures --variant full';

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
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  main().catch((error: unknown) => {
    process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
