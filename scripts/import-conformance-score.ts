export interface ImportConformanceOutcomeCounts {
  importedWrong: number;
  silentlyWrong: number;
  threw: number;
  unsupportedClean: number;
}

export interface ImportConformanceMeasuredCapability {
  id: string;
  outcomes: ImportConformanceOutcomeCounts;
  passed: boolean;
  state: 'measured';
  witnesses: number;
}

export interface ImportConformanceUnmeasuredCapability {
  id: string;
  state: 'unmeasured';
}

export type ImportConformanceNotRunReason = 'missing-shard' | 'pack-unavailable';

export interface ImportConformanceNotRunCapability {
  completedWitnesses: number;
  expectedWitnesses: number;
  id: string;
  reason: ImportConformanceNotRunReason;
  state: 'not-run';
}

export type ImportConformanceCapability =
  | ImportConformanceMeasuredCapability
  | ImportConformanceNotRunCapability
  | ImportConformanceUnmeasuredCapability;

export interface ImportConformanceMeasuredShard {
  id: number;
  state: 'measured';
}

export interface ImportConformanceNotRunShard {
  id: number;
  reason: string;
  state: 'not-run';
}

export type ImportConformanceShard = ImportConformanceMeasuredShard | ImportConformanceNotRunShard;

export interface ImportConformanceSharding {
  algorithm: 'fixture-count-v1';
  planHash: string;
  shards: ImportConformanceShard[];
}

export interface ImportConformanceSummary {
  exercisedCapabilities: number;
  passedCapabilities: number;
  singleWitnessCapabilities: number;
  totalCapabilities: number;
}

interface ImportConformancePackIdentity {
  capabilities: ImportConformanceCapability[];
  id: string;
  importerSourceHash: string;
  release: string;
  variant: string;
}

export interface ImportConformanceMeasuredPack extends ImportConformancePackIdentity {
  outcomes: ImportConformanceOutcomeCounts;
  sharding: ImportConformanceSharding;
  state: 'measured';
  summary: ImportConformanceSummary;
}

export interface ImportConformanceNotRunPack extends ImportConformancePackIdentity {
  outcomes: null;
  reason: ImportConformanceNotRunReason;
  sharding: ImportConformanceSharding | null;
  state: 'not-run';
  summary: null;
}

export type ImportConformancePack = ImportConformanceMeasuredPack | ImportConformanceNotRunPack;

export interface ImportConformanceProvenance {
  mode: 'exhaustive';
  runId: string;
  runUrl: string;
}

export interface ImportConformanceScore {
  packs: ImportConformancePack[];
  provenance: ImportConformanceProvenance;
  schemaVersion: 1;
}

export function parseImportConformanceScore(value: unknown, source = 'score'): ImportConformanceScore {
  const root = expectRecord(value, source);
  expectKeys(root, ['packs', 'provenance', 'schemaVersion'], source);
  if (root.schemaVersion !== 1) fail(`${source}.schemaVersion`, 'must be exactly 1');
  if (!Array.isArray(root.packs)) fail(`${source}.packs`, 'must be an array');

  const packs = root.packs.map((pack, index) => parsePack(pack, `${source}.packs[${index}]`));
  expectSortedUnique(
    packs.map((pack) => pack.id),
    `${source}.packs`,
    'pack id',
  );
  return { packs, provenance: parseProvenance(root.provenance, `${source}.provenance`), schemaVersion: 1 };
}

function parseProvenance(value: unknown, path: string): ImportConformanceProvenance {
  const provenance = expectRecord(value, path);
  expectKeys(provenance, ['mode', 'runId', 'runUrl'], path);
  if (provenance.mode !== 'exhaustive') fail(`${path}.mode`, "must be exactly 'exhaustive'");
  return {
    mode: 'exhaustive',
    runId: expectNonemptyString(provenance.runId, `${path}.runId`),
    runUrl: expectNonemptyString(provenance.runUrl, `${path}.runUrl`),
  };
}

function parsePack(value: unknown, path: string): ImportConformancePack {
  const pack = expectRecord(value, path);
  const state = expectString(pack.state, `${path}.state`);
  const commonKeys = [
    'capabilities',
    'id',
    'importerSourceHash',
    'outcomes',
    'release',
    'sharding',
    'state',
    'summary',
    'variant',
  ];
  if (state === 'measured') {
    expectKeys(pack, commonKeys, path);
  } else if (state === 'not-run') {
    expectKeys(pack, [...commonKeys, 'reason'], path);
  } else {
    fail(`${path}.state`, "must be 'measured' or 'not-run'");
  }

  const capabilities = parseCapabilities(pack.capabilities, `${path}.capabilities`);
  if (capabilities.length === 0) fail(`${path}.capabilities`, 'must retain at least one stable capability id');
  const identity = {
    capabilities,
    id: expectNonemptyString(pack.id, `${path}.id`),
    importerSourceHash: expectNonemptyString(pack.importerSourceHash, `${path}.importerSourceHash`),
    release: expectNonemptyString(pack.release, `${path}.release`),
    variant: expectNonemptyString(pack.variant, `${path}.variant`),
  };

  if (state === 'measured') {
    if (capabilities.some((capability) => capability.state === 'not-run')) {
      fail(`${path}.capabilities`, "a measured pack cannot contain a 'not-run' capability");
    }
    const sharding = parseSharding(pack.sharding, `${path}.sharding`);
    if (sharding.shards.some((shard) => shard.state === 'not-run')) {
      fail(`${path}.sharding.shards`, "a measured pack cannot contain a 'not-run' shard");
    }
    const summary = parseSummary(pack.summary, `${path}.summary`);
    assertSummaryMatches(summary, capabilities, `${path}.summary`);
    return {
      ...identity,
      outcomes: parseOutcomes(pack.outcomes, `${path}.outcomes`),
      sharding,
      state,
      summary,
    };
  }

  if (pack.outcomes !== null) fail(`${path}.outcomes`, "must be null when the pack is 'not-run'");
  if (pack.summary !== null) fail(`${path}.summary`, "must be null when the pack is 'not-run'");
  const reason = parseNotRunReason(pack.reason, `${path}.reason`);
  const sharding = pack.sharding === null ? null : parseSharding(pack.sharding, `${path}.sharding`);
  assertNotRunPack(reason, capabilities, sharding, path);
  return { ...identity, outcomes: null, reason, sharding, state, summary: null };
}

function parseCapabilities(value: unknown, path: string): ImportConformanceCapability[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  const capabilities = value.map((capability, index) => parseCapability(capability, `${path}[${index}]`));
  expectSortedUnique(
    capabilities.map((capability) => capability.id),
    path,
    'capability id',
  );
  return capabilities;
}

function parseCapability(value: unknown, path: string): ImportConformanceCapability {
  const capability = expectRecord(value, path);
  const state = expectString(capability.state, `${path}.state`);
  const id = expectNonemptyString(capability.id, `${path}.id`);
  if (state === 'unmeasured') {
    expectKeys(capability, ['id', 'state'], path);
    return { id, state };
  }
  if (state === 'measured') {
    expectKeys(capability, ['id', 'outcomes', 'passed', 'state', 'witnesses'], path);
    const witnesses = expectInteger(capability.witnesses, `${path}.witnesses`, 1);
    const passed = expectBoolean(capability.passed, `${path}.passed`);
    const outcomes = parseOutcomes(capability.outcomes, `${path}.outcomes`);
    if (passed && outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong > 0) {
      fail(`${path}.passed`, 'cannot be true when a defect outcome is present');
    }
    return { id, outcomes, passed, state, witnesses };
  }
  if (state === 'not-run') {
    expectKeys(capability, ['completedWitnesses', 'expectedWitnesses', 'id', 'reason', 'state'], path);
    const completedWitnesses = expectInteger(capability.completedWitnesses, `${path}.completedWitnesses`, 0);
    const expectedWitnesses = expectInteger(capability.expectedWitnesses, `${path}.expectedWitnesses`, 0);
    if (completedWitnesses > expectedWitnesses) {
      fail(`${path}.completedWitnesses`, 'cannot exceed expectedWitnesses');
    }
    return {
      completedWitnesses,
      expectedWitnesses,
      id,
      reason: parseNotRunReason(capability.reason, `${path}.reason`),
      state,
    };
  }
  return fail(`${path}.state`, "must be 'measured', 'unmeasured', or 'not-run'");
}

function parseOutcomes(value: unknown, path: string): ImportConformanceOutcomeCounts {
  const outcomes = expectRecord(value, path);
  expectKeys(outcomes, ['importedWrong', 'silentlyWrong', 'threw', 'unsupportedClean'], path);
  return {
    importedWrong: expectInteger(outcomes.importedWrong, `${path}.importedWrong`, 0),
    silentlyWrong: expectInteger(outcomes.silentlyWrong, `${path}.silentlyWrong`, 0),
    threw: expectInteger(outcomes.threw, `${path}.threw`, 0),
    unsupportedClean: expectInteger(outcomes.unsupportedClean, `${path}.unsupportedClean`, 0),
  };
}

function parseSharding(value: unknown, path: string): ImportConformanceSharding {
  const sharding = expectRecord(value, path);
  expectKeys(sharding, ['algorithm', 'planHash', 'shards'], path);
  if (sharding.algorithm !== 'fixture-count-v1') {
    fail(`${path}.algorithm`, "must be exactly 'fixture-count-v1'");
  }
  if (!Array.isArray(sharding.shards)) fail(`${path}.shards`, 'must be an array');
  if (sharding.shards.length === 0) fail(`${path}.shards`, 'must retain the complete non-empty shard plan');
  const shards = sharding.shards.map((shard, index) => parseShard(shard, `${path}.shards[${index}]`));
  expectSortedUnique(
    shards.map((shard) => shard.id),
    `${path}.shards`,
    'shard id',
  );
  return {
    algorithm: 'fixture-count-v1',
    planHash: expectNonemptyString(sharding.planHash, `${path}.planHash`),
    shards,
  };
}

function parseShard(value: unknown, path: string): ImportConformanceShard {
  const shard = expectRecord(value, path);
  const id = expectInteger(shard.id, `${path}.id`, 0);
  const state = expectString(shard.state, `${path}.state`);
  if (state === 'measured') {
    expectKeys(shard, ['id', 'state'], path);
    return { id, state };
  }
  if (state === 'not-run') {
    expectKeys(shard, ['id', 'reason', 'state'], path);
    return { id, reason: expectNonemptyString(shard.reason, `${path}.reason`), state };
  }
  return fail(`${path}.state`, "must be 'measured' or 'not-run'");
}

function parseSummary(value: unknown, path: string): ImportConformanceSummary {
  const summary = expectRecord(value, path);
  expectKeys(
    summary,
    ['exercisedCapabilities', 'passedCapabilities', 'singleWitnessCapabilities', 'totalCapabilities'],
    path,
  );
  return {
    exercisedCapabilities: expectInteger(summary.exercisedCapabilities, `${path}.exercisedCapabilities`, 0),
    passedCapabilities: expectInteger(summary.passedCapabilities, `${path}.passedCapabilities`, 0),
    singleWitnessCapabilities: expectInteger(summary.singleWitnessCapabilities, `${path}.singleWitnessCapabilities`, 0),
    totalCapabilities: expectInteger(summary.totalCapabilities, `${path}.totalCapabilities`, 0),
  };
}

function assertSummaryMatches(
  summary: Readonly<ImportConformanceSummary>,
  capabilities: readonly Readonly<ImportConformanceCapability>[],
  path: string,
): void {
  const measured = capabilities.filter(
    (capability): capability is ImportConformanceMeasuredCapability => capability.state === 'measured',
  );
  const expected: ImportConformanceSummary = {
    exercisedCapabilities: measured.length,
    passedCapabilities: measured.filter((capability) => capability.passed).length,
    singleWitnessCapabilities: measured.filter((capability) => capability.witnesses === 1).length,
    totalCapabilities: capabilities.length,
  };
  for (const key of Object.keys(expected) as (keyof ImportConformanceSummary)[]) {
    if (summary[key] !== expected[key]) fail(`${path}.${key}`, `must equal the capability rows (${expected[key]})`);
  }
}

function assertNotRunPack(
  reason: ImportConformanceNotRunReason,
  capabilities: readonly Readonly<ImportConformanceCapability>[],
  sharding: Readonly<ImportConformanceSharding> | null,
  path: string,
): void {
  if (reason === 'pack-unavailable') {
    if (capabilities.some((capability) => capability.state !== 'not-run' || capability.reason !== reason)) {
      fail(
        `${path}.capabilities`,
        "a pack-unavailable pack must retain every capability as pack-unavailable 'not-run'",
      );
    }
    if (sharding?.shards.some((shard) => shard.state !== 'not-run')) {
      fail(`${path}.sharding.shards`, 'a pack-unavailable pack cannot contain a measured shard');
    }
    return;
  }

  if (sharding === null) fail(`${path}.sharding`, 'a missing-shard pack must retain its complete shard plan');
  if (sharding.shards.every((shard) => shard.state === 'measured')) {
    fail(`${path}.sharding.shards`, "a missing-shard pack must contain at least one 'not-run' shard");
  }
  const notRunCapabilities = capabilities.filter(
    (capability): capability is ImportConformanceNotRunCapability => capability.state === 'not-run',
  );
  if (notRunCapabilities.length === 0) {
    fail(`${path}.capabilities`, "a missing-shard pack must contain at least one 'not-run' capability");
  }
  for (const capability of notRunCapabilities) {
    if (capability.reason !== reason) {
      fail(`${path}.capabilities`, "a missing-shard pack can only contain missing-shard 'not-run' capabilities");
    }
    if (capability.completedWitnesses >= capability.expectedWitnesses) {
      fail(
        `${path}.capabilities`,
        'a missing-shard capability must have fewer completed witnesses than expected witnesses',
      );
    }
  }
}

function parseNotRunReason(value: unknown, path: string): ImportConformanceNotRunReason {
  if (value !== 'missing-shard' && value !== 'pack-unavailable') {
    fail(path, "must be 'missing-shard' or 'pack-unavailable'");
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function expectInteger(value: unknown, path: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    fail(path, `must be an integer greater than or equal to ${minimum}`);
  }
  return value as number;
}

function expectKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[], path: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(path, `must contain exactly: ${wanted.join(', ')}`);
  }
}

function expectNonemptyString(value: unknown, path: string): string {
  const string = expectString(value, path);
  if (string.trim() === '') fail(path, 'must be non-empty');
  return string;
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function expectSortedUnique(values: readonly (number | string)[], path: string, label: string): void {
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1] >= values[index]) {
      fail(path, `${label}s must be unique and sorted in ascending order`);
    }
  }
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  return value;
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid import-conformance score at ${path}: ${message}`);
}
