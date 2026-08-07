import { createHash } from 'node:crypto';

import {
  assertImportConformanceFrozenCapabilityPartition,
  buildImportConformanceCapabilityIndex,
  createImportConformanceCacheKey,
  createImportConformanceNotRunScore,
  createImportConformanceScore as createImportConformanceScoreCore,
  createImportConformanceShardPlan,
  isImportConformanceFixtureReference,
  parseImportConformanceCapabilityDefinitions,
} from './import-conformance-core';
import type {
  ImportConformanceConfigurationLimits,
  ImportConformanceLossPath,
  ImportConformanceScoreDeclarations,
  ImportConformanceUnwiredLossObservation,
} from './import-conformance-core';
import { parseImportConformanceScore } from './import-conformance-score';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;
const PACK = {
  capabilityConventionRevision: 'unresolved-individuation-v1',
  id: 'swf-ruffle-fixtures',
  release: '0.1.0',
  variant: 'full',
} as const;
const PROVENANCE = { mode: 'exhaustive', runId: 'run-17', runUrl: 'https://ci.invalid/run-17' } as const;

function createImportConformanceScore(
  index: Parameters<typeof createImportConformanceScoreCore>[0],
  plan: Parameters<typeof createImportConformanceScoreCore>[1],
  completedShardIds: Parameters<typeof createImportConformanceScoreCore>[2],
  results: Parameters<typeof createImportConformanceScoreCore>[3],
  instrumentationProofs: Parameters<typeof createImportConformanceScoreCore>[4],
  lossPathByCapability: Parameters<typeof createImportConformanceScoreCore>[5],
  importerSourceHash: Parameters<typeof createImportConformanceScoreCore>[6],
  provenance: Parameters<typeof createImportConformanceScoreCore>[7],
  scoreDeclarations: Parameters<typeof createImportConformanceScoreCore>[8] = declarations(),
) {
  return createImportConformanceScoreCore(
    index,
    plan,
    completedShardIds,
    results,
    instrumentationProofs,
    lossPathByCapability,
    importerSourceHash,
    provenance,
    scoreDeclarations,
  );
}

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

  it('refuses capability evidence carried by a fixture the probe could not read', () => {
    expect(() =>
      buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, [
        {
          capabilities: ['swf.fill.solid'],
          probeState: 'unreadable',
          reference: 'malformed.swf',
          sourceHash: hash('malformed'),
        },
      ]),
    ).toThrow(/Unreadable fixture malformed\.swf must not contribute capability evidence/);
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
    expect(score.instrumentAssurance).toEqual({
      payloadValidity: 'external-audit-required',
      triggerCorrectness: 'proof-reference-presence',
      triggerScope: 'external-audit-required',
      triggerSpecificity: 'proof-reference-presence',
    });
    expect(score.oracleAssurance).toEqual({
      firstCaptureDefects: 'undetectable',
      formatDerivedProperties: 'required-not-implemented',
      ratchet: 'recorded-run-regression-only',
      unmeasuredCapabilityCause: 'no-fixture-vs-upstream-unreachable-not-distinguished',
    });
    expect(score.packs[0]).toMatchObject({
      capabilityConventionRevision: 'unresolved-individuation-v1',
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

  it('refuses both merges and splits of the frozen producer capability partition', () => {
    const merged = createImportConformanceNotRunScore(PACK, DEFINITIONS, hash('importer'), PROVENANCE);
    merged.packs[0]!.capabilities.splice(1, 1);
    expect(() => assertImportConformanceFrozenCapabilityPartition(merged, DEFINITIONS)).toThrow(
      /must exactly equal the frozen capability partition/,
    );

    const split = createImportConformanceNotRunScore(PACK, DEFINITIONS, hash('importer'), PROVENANCE);
    split.packs[0]!.capabilities.push({
      completedWitnesses: 0,
      expectedWitnesses: 0,
      id: 'swf.fill.solid.split',
      reason: 'pack-unavailable',
      state: 'not-run',
    });
    expect(() => assertImportConformanceFrozenCapabilityPartition(split, DEFINITIONS)).toThrow(
      /must exactly equal the frozen capability partition/,
    );
  });
});

describe('createImportConformanceScore', () => {
  it('nests independent fire-referenced and silence-referenced pass populations', () => {
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
      instrumentationProofs('swf.fill.solid'),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );

    expect(score.packs[0]!.summary).toEqual({
      denominators: expectedDenominators(2),
      exercised: {
        capabilities: 1,
        fireReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
        },
        silenceReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
        },
        singleWitnessCapabilities: 0,
      },
      instrumentAudited: { payloadCapabilities: 1, scopeCapabilities: 1 },
      lossPathPopulation: {
        auditedCapabilities: 1,
        auditedNoLossPathCapabilities: 0,
        auditState: 'partial',
        canSilentlyLoseCapabilities: 1,
        unauditedCapabilities: 1,
      },
      proofReferenced: { fireCapabilities: 1, silenceCapabilities: 1 },
    });
    expect(score.packs[0]!.capabilities).toEqual([
      {
        configurationLimits: { state: 'not-applicable' },
        id: 'swf.fill.solid',
        instrumentation: {
          audits: ['payload', 'scope'],
          channel: 'structured-crumb',
          fires: {
            proofs: ['packages/swf/src/swfDocument.test.ts#reports solid-fill loss'],
            state: 'referenced',
          },
          staysSilent: {
            proofs: ['packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent'],
            state: 'referenced',
          },
        },
        lossPath: auditedLossPath('swf.fill.solid', 'identified'),
        outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 1 },
        results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
        state: 'exercised',
        unknownObservations: [],
        witnesses: 2,
      },
      {
        id: 'swf.text.define-text',
        instrumentation: {
          audits: [],
          channel: 'none',
          fires: { state: 'unreferenced' },
          staysSilent: { state: 'unreferenced' },
        },
        lossPath: { state: 'unaudited' },
        state: 'unmeasured',
      },
    ]);
    expect(score.packs[0]).not.toHaveProperty('outcomes');
    expect(parseImportConformanceScore(score, 'producer score')).toEqual(score);
  });

  it('refuses a frozen individuation reading that drifts from the declared capability rows', () => {
    const index = makeIndex();
    const scoreDeclarations = declarations();
    scoreDeclarations.individuationMargin.frozenDeclaredRows = 3;
    expect(() =>
      createImportConformanceScore(
        index,
        createImportConformanceShardPlan(
          index.fixtures.map((fixture) => fixture.reference),
          1,
        ),
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
        instrumentationProofs('swf.fill.solid'),
        lossPathStates(),
        hash('importer'),
        PROVENANCE,
        scoreDeclarations,
      ),
    ).toThrow(/Individuation margin .* matching the declared rows/);
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
      instrumentationProofs('swf.fill.solid'),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      results: { fire: { state: 'fail' }, silence: { state: 'fail' } },
      state: 'exercised',
    });
    expect(score.packs[0]!.summary).toMatchObject({
      exercised: {
        fireReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 1, passedCapabilities: 0, unknownCapabilities: 0 },
        },
        silenceReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 1, passedCapabilities: 0, unknownCapabilities: 0 },
        },
      },
    });
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
      instrumentationProofs('swf.fill.solid'),
      lossPathStates(),
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
    expect(score.packs[0]!.capabilities[1]).toEqual({
      completedWitnesses: 0,
      expectedWitnesses: 0,
      id: 'swf.text.define-text',
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
        instrumentationProofs('swf.fill.solid'),
        lossPathStates(),
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
      lossPathStates(false),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]).toMatchObject({
      state: 'measured',
      summary: {
        denominators: expectedDenominators(2),
        exercised: {
          capabilities: 1,
          fireReferenced: {
            capabilities: 0,
            results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 0 },
          },
          silenceReferenced: {
            capabilities: 0,
            results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 0 },
          },
          singleWitnessCapabilities: 0,
        },
        lossPathPopulation: {
          auditedCapabilities: 0,
          auditedNoLossPathCapabilities: 0,
          auditState: 'partial',
          canSilentlyLoseCapabilities: 0,
          unauditedCapabilities: 2,
        },
      },
    });
    expect(score.packs[0]!.capabilities[0]).toEqual({
      configurationLimits: { state: 'not-applicable' },
      id: 'swf.fill.solid',
      instrumentation: {
        audits: [],
        channel: 'none',
        fires: { state: 'unreferenced' },
        staysSilent: { state: 'unreferenced' },
      },
      lossPath: { state: 'unaudited' },
      outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      state: 'exercised',
      unknownObservations: [{ reason: 'loss-path-not-identified', reference: 'swf.fill.solid' }],
      witnesses: 2,
    });
    expect(score.packs[0]!.sharding?.shards).toEqual([{ id: 0, state: 'measured' }]);
  });

  it('distinguishes an identified-but-unwired loss path from one not identified', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      lossPathStates(true),
      hash('importer'),
      PROVENANCE,
      declarations({
        'swf.fill.solid': [
          {
            contentFidelity: 'diminished',
            reason: 'loss-path-known-not-wired',
            reference: 'filter-list-drops-blend-mode',
          },
          {
            contentFidelity: 'missing',
            reason: 'loss-path-known-not-wired',
            reference: 'static-text-body-drop',
          },
        ],
      }),
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      unknownObservations: [
        {
          contentFidelity: 'diminished',
          reason: 'loss-path-known-not-wired',
          reference: 'filter-list-drops-blend-mode',
        },
        {
          contentFidelity: 'missing',
          reason: 'loss-path-known-not-wired',
          reference: 'static-text-body-drop',
        },
      ],
    });
  });

  it('makes every unobservable configuration limit a same-id capability-scoped UNKNOWN', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'importedWrong'), result('two.swf', ['swf.fill.solid'], 'passed')],
      instrumentationProofs('swf.fill.solid'),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
      declarations(
        {},
        {
          'swf.fill.solid': {
            limits: [{ id: 'MAX_FILL_RECORDS', reporting: 'unobservable' }],
            state: 'declared',
          },
        },
      ),
    );

    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      configurationLimits: {
        limits: [{ id: 'MAX_FILL_RECORDS', reporting: 'unobservable' }],
        state: 'declared',
      },
      outcomes: { importedWrong: 1, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'loop-bounded-configuration-limit', reference: 'MAX_FILL_RECORDS' }],
    });
  });

  it('retains configuration-limit evidence when the capability loss path is unaudited', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'importedWrong'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      lossPathStates(false),
      hash('importer'),
      PROVENANCE,
      declarations(
        {},
        {
          'swf.fill.solid': {
            limits: [{ id: 'MAX_FILL_RECORDS', reporting: 'unobservable' }],
            state: 'declared',
          },
        },
      ),
    );

    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      lossPath: { state: 'unaudited' },
      unknownObservations: [
        { reason: 'loop-bounded-configuration-limit', reference: 'MAX_FILL_RECORDS' },
        { reason: 'loss-path-not-identified', reference: 'swf.fill.solid' },
      ],
    });
    expect(parseImportConformanceScore(score, 'producer score')).toEqual(score);
  });

  it('does not force UNKNOWN for a configuration limit with structured reporting', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      new Map<string, ImportConformanceLossPath>([
        ['swf.fill.solid', auditedLossPath('swf.fill.solid', 'audited-none')],
        ['swf.text.define-text', { state: 'unaudited' as const }],
      ]),
      hash('importer'),
      PROVENANCE,
      declarations(
        {},
        {
          'swf.fill.solid': {
            limits: [{ id: 'MAX_FILL_RECORDS', reporting: 'structured' }],
            state: 'declared',
          },
        },
      ),
    );

    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
      unknownObservations: [],
    });
  });

  it('rejects declaration drift instead of repairing it in the score', () => {
    const index = makeIndex();
    expect(() =>
      createImportConformanceScore(
        index,
        createImportConformanceShardPlan(
          index.fixtures.map((fixture) => fixture.reference),
          1,
        ),
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
        new Map(),
        new Map<string, ImportConformanceLossPath>([
          ['swf.fill.solid', auditedLossPath('swf.fill.solid', 'audited-none')],
          ['swf.text.define-text', { state: 'unaudited' as const }],
        ]),
        hash('importer'),
        PROVENANCE,
        declarations(
          {},
          {
            'swf.fill.solid': {
              limits: [
                { id: 'MAX_Z_RECORDS', reporting: 'unobservable' },
                { id: 'MAX_A_RECORDS', reporting: 'unobservable' },
              ],
              state: 'declared',
            },
          },
        ),
      ),
    ).toThrow(/configuration limit ids must be unique and sorted in ascending order/);
  });

  it('makes a structured crumb with an incomplete member audit capability-scoped UNKNOWN', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map([
        [
          'swf.fill.solid',
          {
            audits: ['payload'] as const,
            channel: 'structured-crumb' as const,
            fires: ['test#fires'],
            staysSilent: ['test#silent'],
          },
        ],
      ]),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );

    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'instrument-audit-incomplete', reference: 'swf.fill.solid' }],
    });
  });

  it('refuses to infer a loss-path state from an absent artifact declaration', () => {
    const index = makeIndex();
    expect(() =>
      createImportConformanceScore(
        index,
        createImportConformanceShardPlan(
          index.fixtures.map((fixture) => fixture.reference),
          1,
        ),
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
        new Map(),
        new Map([['swf.fill.solid', { state: 'unaudited' as const }]]),
        hash('importer'),
        PROVENANCE,
      ),
    ).toThrow(/Every declared capability requires an explicit loss-path declaration/);
  });

  it('reports audited-none separately from both identified and unaudited members', () => {
    const index = buildImportConformanceCapabilityIndex(PACK, DEFINITIONS, []);
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan([], 1),
      new Set([0]),
      [],
      new Map(),
      new Map<string, ImportConformanceLossPath>([
        ['swf.fill.solid', auditedLossPath('swf.fill.solid', 'audited-none')],
        ['swf.text.define-text', { state: 'unaudited' as const }],
      ]),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]).toMatchObject({
      summary: {
        lossPathPopulation: {
          auditedCapabilities: 1,
          auditedNoLossPathCapabilities: 1,
          auditState: 'partial',
          canSilentlyLoseCapabilities: 0,
          unauditedCapabilities: 1,
        },
      },
    });
    expect(score.packs[0]!.capabilities).toEqual([
      {
        id: 'swf.fill.solid',
        instrumentation: {
          audits: [],
          channel: 'none',
          fires: { state: 'unreferenced' },
          staysSilent: { state: 'unreferenced' },
        },
        lossPath: auditedLossPath('swf.fill.solid', 'audited-none'),
        state: 'unmeasured',
      },
      {
        id: 'swf.text.define-text',
        instrumentation: {
          audits: [],
          channel: 'none',
          fires: { state: 'unreferenced' },
          staysSilent: { state: 'unreferenced' },
        },
        lossPath: { state: 'unaudited' },
        state: 'unmeasured',
      },
    ]);
  });

  it('lets an audited-none member license clean observations without inherited proof references', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      new Map<string, ImportConformanceLossPath>([
        ['swf.fill.solid', auditedLossPath('swf.fill.solid', 'audited-none')],
        ['swf.text.define-text', { state: 'unaudited' as const }],
      ]),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      instrumentation: {
        audits: [],
        channel: 'none',
        fires: { state: 'unreferenced' },
        staysSilent: { state: 'unreferenced' },
      },
      results: { fire: { state: 'pass' }, silence: { state: 'pass' } },
      unknownObservations: [],
    });
  });

  it('keeps an unknown diagnostic cause UNKNOWN instead of counting it as a file defect', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [
        result('one.swf', ['swf.fill.solid'], 'importedWrong', 'unknown'),
        result('two.swf', ['swf.fill.solid'], 'passed'),
      ],
      instrumentationProofs('swf.fill.solid'),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'diagnostic-cause-unknown', reference: 'one.swf' }],
    });
  });

  it('requires silence proof only for a crumb observation', () => {
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
      new Map([
        [
          'swf.fill.solid',
          {
            audits: ['payload', 'scope'] as const,
            channel: 'structured-crumb' as const,
            fires: ['test#fires'],
            staysSilent: [],
          },
        ],
      ]),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.summary).toMatchObject({
      exercised: {
        fireReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 1 },
        },
        silenceReferenced: {
          capabilities: 0,
          results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 0 },
        },
      },
    });
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'silence-proof-missing-for-crumb', reference: 'two.swf' }],
    });
  });

  it('keeps an unreferenced lane UNKNOWN without collapsing the referenced lane result', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map([
        [
          'swf.fill.solid',
          {
            audits: ['payload', 'scope'] as const,
            channel: 'structured-crumb' as const,
            fires: ['test#fires'],
            staysSilent: [],
          },
        ],
      ]),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      results: { fire: { state: 'pass' }, silence: { state: 'unknown' } },
      unknownObservations: [],
    });
    expect(score.packs[0]!.summary).toMatchObject({
      exercised: {
        fireReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 0, passedCapabilities: 1, unknownCapabilities: 0 },
        },
        silenceReferenced: {
          capabilities: 0,
          results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 0 },
        },
      },
    });
  });

  it('requires fire proof only for a no-crumb observation', () => {
    const index = makeIndex();
    const plan = createImportConformanceShardPlan(
      index.fixtures.map((fixture) => fixture.reference),
      1,
    );
    const score = createImportConformanceScore(
      index,
      plan,
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'unsupportedClean'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map([
        [
          'swf.fill.solid',
          {
            audits: ['payload', 'scope'] as const,
            channel: 'structured-crumb' as const,
            fires: [],
            staysSilent: ['test#is silent'],
          },
        ],
      ]),
      lossPathStates(),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.summary).toMatchObject({
      exercised: {
        fireReferenced: {
          capabilities: 0,
          results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 0 },
        },
        silenceReferenced: {
          capabilities: 1,
          results: { failedCapabilities: 0, passedCapabilities: 0, unknownCapabilities: 1 },
        },
      },
    });
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      outcomes: { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 1 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'fire-proof-missing-for-no-crumb', reference: 'two.swf' }],
    });
  });

  it('retains a direct defect while capability-scoped uncertainty forces the result UNKNOWN', () => {
    const index = makeIndex();
    const score = createImportConformanceScore(
      index,
      createImportConformanceShardPlan(
        index.fixtures.map((fixture) => fixture.reference),
        1,
      ),
      new Set([0]),
      [result('one.swf', ['swf.fill.solid'], 'importedWrong'), result('two.swf', ['swf.fill.solid'], 'passed')],
      new Map(),
      lossPathStates(false),
      hash('importer'),
      PROVENANCE,
    );
    expect(score.packs[0]!.capabilities[0]).toMatchObject({
      outcomes: { importedWrong: 1, silentlyWrong: 0, threw: 0, unsupportedClean: 0 },
      results: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations: [{ reason: 'loss-path-not-identified', reference: 'swf.fill.solid' }],
    });
  });

  it('refuses proof references on a non-structured diagnostic channel', () => {
    const index = makeIndex();
    expect(() =>
      createImportConformanceScore(
        index,
        createImportConformanceShardPlan(
          index.fixtures.map((fixture) => fixture.reference),
          1,
        ),
        new Set([0]),
        [result('one.swf', ['swf.fill.solid'], 'passed'), result('two.swf', ['swf.fill.solid'], 'passed')],
        new Map([
          [
            'swf.fill.solid',
            { audits: [], channel: 'human-log-only' as const, fires: ['test#fires'], staysSilent: [] },
          ],
        ]),
        lossPathStates(),
        hash('importer'),
        PROVENANCE,
      ),
    ).toThrow(/requires a structured diagnostic crumb/);
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

function instrumentationProofs(id: string) {
  return new Map([
    [
      id,
      {
        audits: ['payload', 'scope'] as const,
        channel: 'structured-crumb' as const,
        fires: ['packages/swf/src/swfDocument.test.ts#reports solid-fill loss'],
        staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported solid fill silent'],
      },
    ],
  ]);
}

function lossPathStates(fillIdentified = true, textIdentified = false) {
  return new Map([
    [
      'swf.fill.solid',
      fillIdentified ? auditedLossPath('swf.fill.solid', 'identified') : ({ state: 'unaudited' } as const),
    ],
    [
      'swf.text.define-text',
      textIdentified ? auditedLossPath('swf.text.define-text', 'identified') : ({ state: 'unaudited' } as const),
    ],
  ]);
}

function auditedLossPath(id: string, state: 'audited-none' | 'identified') {
  return {
    audit: {
      auditId: 'audit:loss-path-v1',
      auditor: 'builder2',
      auditedAt: '2026-08-07T00:00:00.000Z',
      subjectHash: `sha256:subject:${id}`,
    },
    state,
  } as const;
}

function declarations(
  unwiredLossesByCapability: Readonly<
    Record<string, readonly Readonly<ImportConformanceUnwiredLossObservation>[]>
  > = {},
  configurationLimitsByCapability: Readonly<Record<string, Readonly<ImportConformanceConfigurationLimits>>> = {},
): ImportConformanceScoreDeclarations {
  return {
    capabilityScopedUnknownMappings: {
      configurationLimits: Object.entries(configurationLimitsByCapability).flatMap(([capabilityId, limits]) =>
        limits.state === 'not-applicable'
          ? []
          : limits.limits.map((limit) => ({ capabilityIds: [capabilityId] as [string], ...limit })),
      ),
      unwiredLossFamilies: Object.entries(unwiredLossesByCapability).flatMap(([capabilityId, observations]) =>
        observations.map((observation) => ({
          capabilityIds: [capabilityId] as [string],
          contentFidelity: observation.contentFidelity,
          reference: observation.reference,
        })),
      ),
    },
    importerDeclaredCensus: {
      basis: 'single-artifact-cross-check',
      candidateHits: 4,
      falsePositiveHits: 2,
      provenance: 'single-author',
      reference: 'synthetic-capabilities-vs-tag-coverage.md',
      state: 'provisional',
    },
    individuationMargin: {
      behaviorPreservingRefactorRows: 1,
      discriminatedSourceRows: 2,
      frozenDeclaredRows: 2,
      rejectedCircularCandidate: 'corpus-differential-behavior',
      sameDispatchArmRows: 1,
      state: 'frozen-no-election',
    },
  };
}

function expectedDenominators(declaredRows: number) {
  return {
    importerDeclared: {
      census: {
        basis: 'single-artifact-cross-check',
        candidateHits: 4,
        falsePositiveHits: 2,
        provenance: 'single-author',
        reference: 'synthetic-capabilities-vs-tag-coverage.md',
        state: 'provisional',
      },
      declaredRows,
      individuationMargin: {
        behaviorPreservingRefactorRows: 1,
        discriminatedSourceRows: 2,
        frozenDeclaredRows: 2,
        rejectedCircularCandidate: 'corpus-differential-behavior',
        sameDispatchArmRows: 1,
        state: 'frozen-no-election',
      },
      limitation: 'individuation-rule-not-operational',
      state: 'unresolved',
    },
    swfFormat: { state: 'unmeasured' },
  };
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
  diagnosticCause: 'separable' | 'unknown' = 'separable',
) {
  return {
    capabilityOutcomes: capabilities.map((id) => ({
      diagnosticCause,
      diagnosticReported: outcome === 'importedWrong' || outcome === 'unsupportedClean',
      id,
      outcome,
    })),
    outcome,
    reference,
    sourceHash: hash(reference),
  };
}
