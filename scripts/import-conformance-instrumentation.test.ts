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
      { capabilities: [], fireProven: 0, silenceProven: 0 },
      DEFINITIONS,
    );

    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathByCapability]).toEqual([
      ['swf.fill.solid', { state: 'unaudited' }],
      ['swf.text.define-text', { state: 'unaudited' }],
    ]);
    expect(mapping.proofs.size).toBe(0);
  });

  it('does not credit a proof whose owner audit identity is absent', () => {
    const candidate = row('swf.fill.solid', ['test#fires'], []);
    delete (candidate as { lossPath?: unknown }).lossPath;
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [candidate], fireProven: 1, silenceProven: 0 },
      DEFINITIONS,
    );

    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({ state: 'unaudited' });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain(
      'Instrumentation mapping for swf.fill.solid lacks a valid singular loss-path declaration',
    );
    expect(mapping.problems).toContain('Instrumentation proof for swf.fill.solid lacks an identified loss path');
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
    { audit: audit('swf.fill.solid'), state: 'unaudited' },
    { state: 'identified' },
    { audit: { ...audit('swf.fill.solid'), auditedAt: '2026-08-07' }, state: 'identified' },
  ])('refuses an invalid singular loss-path declaration: $state', (lossPath) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ ...row('swf.fill.solid', ['test#fires'], []), lossPath }],
        fireProven: 1,
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

  it('does not credit a proof that contradicts an audited-none loss-path declaration', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [
          {
            ...row('swf.fill.solid', ['test#fires'], []),
            lossPath: { audit: audit('swf.fill.solid'), state: 'audited-none' },
          },
        ],
        fireProven: 1,
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.get('swf.fill.solid')).toEqual({
      audit: audit('swf.fill.solid'),
      state: 'audited-none',
    });
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain('Instrumentation proof for swf.fill.solid lacks an identified loss path');
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
    lossPath: identifiedLossPath(id),
    staysSilent,
  };
}

function identifiedLossPath(id: string) {
  return { audit: audit(id), state: 'identified' };
}

function audit(id: string) {
  return {
    auditId: 'audit:loss-path-v1',
    auditor: 'builder2',
    auditedAt: '2026-08-07T00:00:00.000Z',
    subjectHash: `sha256:subject:${id}`,
  };
}
