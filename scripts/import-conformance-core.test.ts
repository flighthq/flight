import { createHash } from 'node:crypto';

import {
  buildImportConformanceCapabilityIndex,
  createImportConformanceCacheKey,
  createImportConformanceNotRunScore,
  createImportConformanceScore,
  createImportConformanceShardPlan,
  isImportConformanceFixtureReference,
  parseImportConformanceCapabilityDefinitions,
} from './import-conformance-core';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;
const PACK = { id: 'swf-ruffle-fixtures', release: '0.1.0', variant: 'full' } as const;
const PROVENANCE = { mode: 'exhaustive', runId: 'run-17', runUrl: 'https://ci.invalid/run-17' } as const;

describe('buildImportConformanceCapabilityIndex', () => {
  it('retains every declared capability and every fixture without a stride or size selector', () => {
    const evidence = Array.from({ length: 1_001 }, (_, index) => ({
      capabilities: index === 1_000 ? ['swf.fill.solid'] : [],
      reference: `fixture-${String(index).padStart(4, '0')}.swf`,
      sourceHash: hash(String(index)),
    }));
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, evidence);

    expect(index.fixtures).toHaveLength(1_001);
    expect(index.capabilities).toEqual([
      { ...DEFINITIONS[0], witnesses: ['fixture-1000.swf'] },
      { ...DEFINITIONS[1], witnesses: [] },
    ]);
  });

  it('rejects an emitted id missing from the declared denominator', () => {
    expect(() =>
      buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
        { capabilities: ['swf.unknown.branch'], reference: 'fixture.swf', sourceHash: hash('fixture') },
      ]),
    ).toThrow(/undeclared capability swf\.unknown\.branch/);
  });

  it('sorts fixture references and de-duplicates capability evidence', () => {
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
      {
        capabilities: ['swf.fill.solid', 'swf.fill.solid'],
        reference: 'z.swf',
        sourceHash: hash('z'),
      },
      { capabilities: [], reference: 'a.swf', sourceHash: hash('a') },
    ]);
    expect(index.fixtures.map((fixture) => fixture.reference)).toEqual(['a.swf', 'z.swf']);
    expect(index.fixtures[1]!.capabilities).toEqual(['swf.fill.solid']);
  });
});

describe('createImportConformanceCacheKey', () => {
  it('invalidates independently for fixture bytes and importing source', () => {
    const original = createImportConformanceCacheKey(hash('fixture-a'), hash('importer-a'));
    expect(createImportConformanceCacheKey(hash('fixture-b'), hash('importer-a'))).not.toBe(original);
    expect(createImportConformanceCacheKey(hash('fixture-a'), hash('importer-b'))).not.toBe(original);
    expect(createImportConformanceCacheKey(hash('fixture-a'), hash('importer-a'))).toBe(original);
  });
});

describe('createImportConformanceNotRunScore', () => {
  it('retains the complete capability identity when the pack is unavailable', () => {
    const score = createImportConformanceNotRunScore(PACK, DEFINITIONS, hash('importer'), PROVENANCE);
    expect(score.packs[0]).toMatchObject({
      outcomes: null,
      reason: 'pack-unavailable',
      release: '0.1.0',
      state: 'not-run',
      summary: null,
      variant: 'full',
    });
    expect(score.packs[0]!.capabilities).toEqual(
      DEFINITIONS.map((definition) => ({
        completedWitnesses: 0,
        expectedWitnesses: 0,
        id: definition.id,
        reason: 'pack-unavailable',
        state: 'not-run',
      })),
    );
  });

  it('refuses score provenance that cannot name the exhaustive full-index run', () => {
    expect(() =>
      createImportConformanceNotRunScore(PACK, DEFINITIONS, hash('importer'), {
        mode: 'exhaustive',
        runId: '',
        runUrl: 'https://ci.invalid/run',
      }),
    ).toThrow(/full-index runId and runUrl/);
  });
});

describe('createImportConformanceScore', () => {
  it('nests exercised, instrumented, pass, and single-witness populations', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'unsupportedClean')],
      new Map([['swf.fill.solid', 'packages/swf/src/swfDocument.test.ts#reports solid-fill loss']]),
      'measured',
      hash('importer'),
      PROVENANCE,
    );

    expect(score.packs[0]!.summary).toEqual({
      totalCapabilities: 2,
      exercised: {
        capabilities: 1,
        instrumented: { capabilities: 1, passedCapabilities: 1 },
        singleWitnessCapabilities: 0,
      },
    });
    expect(score.packs[0]!.capabilities).toEqual([
      {
        id: 'swf.fill.solid',
        instrumentationProof: 'packages/swf/src/swfDocument.test.ts#reports solid-fill loss',
        outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 1 },
        result: 'pass',
        state: 'measured',
        witnesses: 2,
      },
      { id: 'swf.text.define-text', state: 'unmeasured' },
    ]);
  });

  it.each(['threw', 'importedWrong', 'silentlyWrong'] as const)('treats %s as a failing outcome', (outcome) => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], outcome), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map([['swf.fill.solid', 'packages/swf/src/swfDocument.test.ts#reports solid-fill loss']]),
      'measured',
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({ result: 'fail', state: 'measured' });
  });

  it('makes the whole pack NOT RUN without shrinking the denominator when one shard is missing', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      2,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed')],
      new Map([['swf.fill.solid', 'packages/swf/src/swfDocument.test.ts#reports solid-fill loss']]),
      'measured',
      hash('importer'),
      PROVENANCE,
    );

    expect(score.packs[0]).toMatchObject({ outcomes: null, reason: 'missing-shard', state: 'not-run', summary: null });
    expect(score.packs[0]!.sharding?.shards).toEqual([
      { id: 0, state: 'measured' },
      { id: 1, reason: 'missing-shard', state: 'not-run' },
    ]);
    expect(score.packs[0]!.capabilities[0]).toEqual({
      completedWitnesses: 1,
      expectedWitnesses: 2,
      id: 'swf.fill.solid',
      reason: 'missing-shard',
      state: 'not-run',
    });
  });

  it('refuses a shard plan from a smaller fixture selection', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(['one.swf'], 1);
    expect(() =>
      createImportConformanceScore(
        index,
        plan,
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed')],
        new Map([['swf.fill.solid', 'packages/swf/src/swfDocument.test.ts#reports solid-fill loss']]),
        'measured',
        hash('importer'),
        PROVENANCE,
      ),
    ).toThrow(/does not match the exhaustive capability index/);
  });

  it('makes instrumentation-blind exercised capabilities explicit in the nested score', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      'measured',
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]).toMatchObject({
      state: 'measured',
      summary: {
        totalCapabilities: 2,
        exercised: {
          capabilities: 1,
          instrumented: { capabilities: 0, passedCapabilities: 0 },
          singleWitnessCapabilities: 0,
        },
      },
    });
    expect(score.packs[0]!.capabilities[0]).toEqual({
      id: 'swf.fill.solid',
      reason: 'diagnostic-instrumentation-missing',
      state: 'unknown',
      witnesses: 2,
    });
    expect(score.packs[0]!.sharding?.shards).toEqual([{ id: 0, state: 'measured' }]);
  });

  it('can fail a fully executed score safe while UNKNOWN baseline policy is pending', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      'not-run',
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]).toMatchObject({
      outcomes: null,
      reason: 'instrumentation-incomplete',
      state: 'not-run',
      summary: null,
    });
    expect(score.packs[0]!.sharding?.shards).toEqual([{ id: 0, state: 'measured' }]);
  });

  it('refuses to count an instrument without a non-empty firing-test proof', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    expect(() =>
      createImportConformanceScore(
        index,
        plan,
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
        new Map([['swf.fill.solid', '']]),
        'measured',
        hash('importer'),
        PROVENANCE,
      ),
    ).toThrow(/must be non-empty/);
  });
});

describe('createImportConformanceShardPlan', () => {
  it('assigns sorted references by deterministic file count and retains empty shard ids', () => {
    const plan = createImportConformanceShardPlan(['c.swf', 'a.swf', 'b.swf'], 5);
    expect(plan.assignments).toEqual([
      { reference: 'a.swf', shardId: 0 },
      { reference: 'b.swf', shardId: 1 },
      { reference: 'c.swf', shardId: 2 },
    ]);
    expect(plan.shardCount).toBe(5);
    expect(createImportConformanceShardPlan(['c.swf', 'b.swf', 'a.swf'], 5).planHash).toBe(plan.planHash);
    expect(createImportConformanceShardPlan(['a.swf', 'b.swf', 'c.swf'], 4).planHash).not.toBe(plan.planHash);
  });
});

describe('isImportConformanceFixtureReference', () => {
  it('selects every SWF except a path with a LICENSES segment by name', () => {
    expect(isImportConformanceFixtureReference('suite/large.SWF')).toBe(true);
    expect(isImportConformanceFixtureReference('suite/LICENSES/fixture.swf')).toBe(false);
    expect(isImportConformanceFixtureReference('suite/LICENSES.txt')).toBe(false);
    expect(isImportConformanceFixtureReference('suite/test.toml')).toBe(false);
  });
});

describe('parseImportConformanceCapabilityDefinitions', () => {
  it('requires the declared count and stable sorted ids', () => {
    expect(parseImportConformanceCapabilityDefinitions({ capabilities: DEFINITIONS, count: 2 })).toEqual(DEFINITIONS);
    expect(() => parseImportConformanceCapabilityDefinitions({ capabilities: DEFINITIONS, count: 75 })).toThrow(
      /artifact root/,
    );
    expect(() =>
      parseImportConformanceCapabilityDefinitions({ capabilities: [...DEFINITIONS].reverse(), count: 2 }),
    ).toThrow(/capability ids must be sorted/);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeIndex() {
  return buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
    { capabilities: ['swf.fill.solid'], reference: 'one.swf', sourceHash: hash('one.swf') },
    { capabilities: ['swf.fill.solid'], reference: 'two.swf', sourceHash: hash('two.swf') },
  ]);
}

function result(
  reference: string,
  capabilities: string[],
  outcome: 'importedWrong' | 'passed' | 'silentlyWrong' | 'threw' | 'unsupportedClean',
) {
  return {
    capabilityOutcomes: capabilities.map((id) => ({ id, outcome })),
    outcome,
    reference,
    sourceHash: hash(reference),
  };
}
