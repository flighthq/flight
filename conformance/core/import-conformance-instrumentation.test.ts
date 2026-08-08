import { parseImportConformanceInstrumentationMapping } from './import-conformance-instrumentation';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;

describe('parseImportConformanceInstrumentationMapping', () => {
  it('left-joins sparse proof rows onto the frozen capability population', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [
          row('swf.fill.solid', ['packages/swf/src/swfDocument.test.ts#reports loss'], []),
          row('swf.text.define-text', [], ['packages/swf/src/swfDocument.test.ts#keeps supported input silent']),
        ],
        fireProven: 1,
        lossPathIdentified: 2,
        silenceProven: 1,
      },
      DEFINITIONS,
    );

    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathByCapability]).toEqual([
      ['swf.fill.solid', identifiedLossPath('swf.fill.solid')],
      ['swf.text.define-text', identifiedLossPath('swf.text.define-text')],
    ]);
    expect([...mapping.proofs]).toEqual([
      [
        'swf.fill.solid',
        {
          audits: ['payload', 'scope'],
          fires: ['packages/swf/src/swfDocument.test.ts#reports loss'],
          staysSilent: [],
        },
      ],
      [
        'swf.text.define-text',
        {
          audits: ['payload', 'scope'],
          fires: [],
          staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported input silent'],
        },
      ],
    ]);
  });

  it('defaults frozen ids absent from sparse evidence to unaudited and unreferenced', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [], fireProven: 0, lossPathIdentified: 0, silenceProven: 0 },
      DEFINITIONS,
    );

    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathByCapability]).toEqual([
      ['swf.fill.solid', { state: 'unaudited' }],
      ['swf.text.define-text', { state: 'unaudited' }],
    ]);
    expect(mapping.proofs.size).toBe(0);
  });

  it('does not credit a proof whose owner marks its loss path unaudited', () => {
    const candidate = {
      ...row('swf.fill.solid', ['test#fires'], []),
      lossFamily: null,
      lossPath: { state: 'unaudited' },
    };
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [candidate], fireProven: 1, lossPathIdentified: 0, silenceProven: 0 },
      DEFINITIONS,
    );

    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({ state: 'unaudited' });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain('Instrumentation proof for swf.fill.solid lacks an identified loss path');
  });

  it.each([
    {
      expected: 'Instrumentation mapping for swf.fill.solid collapses an unknown audit state into null',
      lossPath: null,
    },
    {
      expected: 'Instrumentation mapping for swf.fill.solid has an audit whose identity is unavailable',
      lossPath: {
        family: lossFamily('swf.fill.solid'),
        reason: 'audit commit not recoverable from history',
        state: 'unidentified',
      },
    },
  ])('blocks a loss path that cannot safely project into the score union', ({ expected, lossPath }) => {
    const candidate = { ...row('swf.fill.solid', ['test#fires'], []), lossPath };
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [candidate], fireProven: 1, lossPathIdentified: 0, silenceProven: 0 },
      DEFINITIONS,
    );

    expect(mapping.blockingProblems).toEqual([expected]);
    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({ state: 'unaudited' });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
  });

  it.each([
    { fires: [], staysSilent: [] },
    { fires: ['z', 'a'], staysSilent: [] },
    { fires: [], staysSilent: [''] },
  ])('leaves a capability unreferenced when its represented proof role is invalid', (proofs) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ ...row('swf.fill.solid', [], []), ...proofs }],
        fireProven: 0,
        lossPathIdentified: 0,
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems.length).toBeGreaterThan(0);
  });

  it('invalidates only the proof population whose declared count is stale', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [row('swf.fill.solid', ['test#fires'], ['test#silent'])],
        fireProven: 75,
        lossPathIdentified: 1,
        silenceProven: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.get('swf.fill.solid')).toEqual({
      audits: ['payload', 'scope'],
      fires: [],
      staysSilent: ['test#silent'],
    });
    expect(mapping.problems).toEqual(['Instrumentation mapping fire-proven count is stale']);
  });

  it('removes duplicated and undeclared rows instead of manufacturing instrumentation', () => {
    const candidate = row('swf.fill.solid', ['test#fires'], []);
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [candidate, candidate, { ...candidate, id: 'swf.unknown' }],
        fireProven: 0,
        lossPathIdentified: 0,
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.size).toBe(0);
    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({ state: 'unaudited' });
    expect(mapping.problems).toEqual([
      'Instrumentation mapping capability ids are not sorted and unique',
      'Instrumentation mapping repeats capability swf.fill.solid',
      'Instrumentation mapping names undeclared capability swf.unknown',
    ]);
  });

  it.each([
    { ...ownerLossPath('swf.fill.solid'), family: 'wrong family' },
    { state: 'identified' },
    { ...ownerLossPath('swf.fill.solid'), auditedAt: '2026-08-07' },
  ])('refuses an invalid singular loss-path declaration', (lossPath) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ ...row('swf.fill.solid', ['test#fires'], []), lossPath }],
        fireProven: 1,
        lossPathIdentified: 0,
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({ state: 'unaudited' });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain(
      'Instrumentation mapping for swf.fill.solid lacks a valid singular loss-path declaration',
    );
  });

  it('normalizes a real offset audit instant into the score timestamp shape', () => {
    const candidate = row('swf.fill.solid', ['test#fires'], []);
    candidate.lossPath = { ...candidate.lossPath!, auditedAt: '2026-08-07T11:36:15-07:00' };
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [candidate],
        fireProven: 1,
        lossPathIdentified: 1,
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({
      audit: { ...audit('swf.fill.solid'), auditedAt: '2026-08-07T18:36:15.000Z' },
      state: 'identified',
    });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(true);
    expect(mapping.problems).toEqual([]);
  });

  it('retains the frozen fallback population when the sparse artifact root is invalid', () => {
    const mapping = parseImportConformanceInstrumentationMapping(null, DEFINITIONS);
    expect([...mapping.lossPathByCapability.values()]).toEqual([{ state: 'unaudited' }, { state: 'unaudited' }]);
    expect(mapping.problems).toEqual(['Instrumentation mapping root is invalid']);
  });
});

function row(id: string, fires: string[], staysSilent: string[]) {
  return {
    audits: ['payload', 'scope'],
    fires,
    id,
    lossFamily: lossFamily(id),
    lossPath: ownerLossPath(id),
    staysSilent,
  };
}

function identifiedLossPath(id: string) {
  return { audit: audit(id), state: 'identified' };
}

function ownerLossPath(id: string) {
  return { ...audit(id), family: lossFamily(id), state: 'identified' };
}

function lossFamily(id: string) {
  return `family:${id}`;
}

function audit(id: string) {
  return {
    auditId: 'audit:loss-path-v1',
    auditor: 'builder2',
    auditedAt: '2026-08-07T00:00:00.000Z',
    subjectHash: `sha256:subject:${id}`,
  };
}
