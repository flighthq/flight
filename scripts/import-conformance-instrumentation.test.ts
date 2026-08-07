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
        fireProven: 1,
        lossPaths: lossPaths(true, true),
        silenceProven: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.problems).toEqual([]);
    expect([...mapping.lossPathIdentifiedByCapability]).toEqual([
      ['swf.fill.solid', true],
      ['swf.text.define-text', true],
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
        fireProven: row.fires.length === 0 ? 0 : 1,
        lossPaths: lossPaths(true, false),
        silenceProven: row.staysSilent.length === 0 ? 0 : 1,
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
        fireProven: 75,
        lossPaths: lossPaths(true, false),
        silenceProven: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.proofs.get('swf.fill.solid')).toEqual({ fires: [], staysSilent: ['test#silent'] });
    expect(mapping.problems).toEqual(['Instrumentation mapping fire-proven count is stale']);
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
        fireProven: 0,
        lossPaths: lossPaths(true, false),
        silenceProven: 0,
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
        fireProven: 0,
        lossPaths: [{ id: 'swf.fill.solid', state: 'not-identified' }],
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathIdentifiedByCapability.size).toBe(0);
    expect(mapping.problems).toContain('Instrumentation loss-path declarations are not sorted, unique, and exhaustive');
  });

  it('rejects a proof that contradicts a not-identified loss-path declaration', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [{ fires: ['test#fires'], id: 'swf.fill.solid', staysSilent: [] }],
        fireProven: 1,
        lossPaths: lossPaths(false, false),
        silenceProven: 0,
      },
      DEFINITIONS,
    );
    expect(mapping.lossPathIdentifiedByCapability.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toContain('Instrumentation proof for swf.fill.solid lacks an identified loss path');
  });
});

function lossPaths(fillIdentified: boolean, textIdentified: boolean) {
  return [
    { id: 'swf.fill.solid', state: fillIdentified ? 'identified' : 'not-identified' },
    { id: 'swf.text.define-text', state: textIdentified ? 'identified' : 'not-identified' },
  ];
}
