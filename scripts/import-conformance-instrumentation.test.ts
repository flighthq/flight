import { parseImportConformanceInstrumentationMapping } from './import-conformance-instrumentation';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;

describe('parseImportConformanceInstrumentationMapping', () => {
  it('retains independent fire and silence proof populations', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [
          {
            fires: ['packages/swf/src/swfDocument.test.ts#reports loss'],
            id: 'swf.fill.solid',
            staysSilent: [],
          },
          {
            fires: [],
            id: 'swf.text.define-text',
            staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported input silent'],
          },
        ],
        fireReferenced: 1,
        lossPaths: lossPaths(true, true),
        silenceReferenced: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathByCapability]).toEqual([
      ['swf.fill.solid', { audit: audit('swf.fill.solid'), state: 'identified' }],
      ['swf.text.define-text', { audit: audit('swf.text.define-text'), state: 'identified' }],
    ]);
    expect([...mapping.proofs]).toEqual([
      ['swf.fill.solid', { fires: ['packages/swf/src/swfDocument.test.ts#reports loss'], staysSilent: [] }],
      [
        'swf.text.define-text',
        {
          fires: [],
          staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported input silent'],
        },
      ],
    ]);
  });

  it.each([
    { fires: [], staysSilent: [] },
    { fires: ['z', 'a'], staysSilent: [] },
    { fires: [], staysSilent: [''] },
  ])('leaves a capability UNKNOWN when its represented proof role is invalid', (row) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ id: 'swf.fill.solid', ...row }],
        fireReferenced: row.fires.length === 0 ? 0 : 1,
        lossPaths: lossPaths(true, false),
        silenceReferenced: row.staysSilent.length === 0 ? 0 : 1,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems.length).toBeGreaterThan(0);
  });

  it('invalidates only the proof population whose declared count is stale', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [
          {
            fires: ['test#fires'],
            id: 'swf.fill.solid',
            staysSilent: ['test#silent'],
          },
        ],
        fireReferenced: 75,
        lossPaths: lossPaths(true, false),
        silenceReferenced: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.get('swf.fill.solid')).toEqual({ fires: [], staysSilent: ['test#silent'] });
    expect(mapping.problems).toEqual(['Instrumentation mapping fire-referenced count is stale']);
  });

  it('removes duplicated and undeclared rows instead of manufacturing instrumentation', () => {
    const row = {
      fires: ['test#fires'],
      id: 'swf.fill.solid',
      staysSilent: [],
    };
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [row, row, { ...row, id: 'swf.unknown' }],
        fireReferenced: 0,
        lossPaths: lossPaths(true, false),
        silenceReferenced: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.size).toBe(0);
    expect(mapping.problems).toEqual([
      'Instrumentation mapping capability ids are not sorted and unique',
      'Instrumentation mapping repeats capability swf.fill.solid',
      'Instrumentation mapping names undeclared capability swf.unknown',
    ]);
  });

  it('refuses to infer a loss-path state from a missing declaration', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [],
        fireReferenced: 0,
        lossPaths: [{ id: 'swf.fill.solid', state: 'unaudited' }],
        silenceReferenced: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.size).toBe(0);
    expect(mapping.problems).toContain('Instrumentation loss-path declarations are not sorted, unique, and exhaustive');
  });

  it('retains an explicit audited-none member without manufacturing a proof role', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [],
        fireReferenced: 0,
        lossPaths: [
          { audit: audit('swf.fill.solid'), id: 'swf.fill.solid', state: 'audited-none' },
          { id: 'swf.text.define-text', state: 'unaudited' },
        ],
        silenceReferenced: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathByCapability]).toEqual([
      ['swf.fill.solid', { audit: audit('swf.fill.solid'), state: 'audited-none' }],
      ['swf.text.define-text', { state: 'unaudited' }],
    ]);
    expect(mapping.proofs.size).toBe(0);
  });

  it.each([
    { id: 'swf.fill.solid', state: 'identified' },
    { audit: audit('swf.fill.solid'), id: 'swf.fill.solid', state: 'unaudited' },
    {
      audit: { ...audit('swf.fill.solid'), auditedAt: '2026-08-07' },
      id: 'swf.fill.solid',
      state: 'audited-none',
    },
  ])('refuses an audited-population row whose audit membership can drift: $state', (fill) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [],
        fireReferenced: 0,
        lossPaths: [fill, { id: 'swf.text.define-text', state: 'unaudited' }],
        silenceReferenced: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.size).toBe(0);
    expect(mapping.problems).toContain('Instrumentation loss-path declarations are not sorted, unique, and exhaustive');
  });

  it('rejects a proof that contradicts a loss-path declaration without an identified path', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ fires: ['test#fires'], id: 'swf.fill.solid', staysSilent: [] }],
        fireReferenced: 1,
        lossPaths: lossPaths(false, false),
        silenceReferenced: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathByCapability.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain('Instrumentation proof for swf.fill.solid lacks an identified loss path');
  });
});

function lossPaths(fillIdentified: boolean, textIdentified: boolean) {
  return [
    fillIdentified
      ? { audit: audit('swf.fill.solid'), id: 'swf.fill.solid', state: 'identified' }
      : { id: 'swf.fill.solid', state: 'unaudited' },
    textIdentified
      ? { audit: audit('swf.text.define-text'), id: 'swf.text.define-text', state: 'identified' }
      : { id: 'swf.text.define-text', state: 'unaudited' },
  ];
}

function audit(id: string) {
  return {
    auditId: 'audit:loss-path-v1',
    auditor: 'builder2',
    auditedAt: '2026-08-07T00:00:00.000Z',
    subjectHash: `sha256:subject:${id}`,
  };
}
