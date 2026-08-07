import { parseImportConformanceInstrumentationMapping } from './import-conformance-instrumentation';

const DEFINITIONS = [
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
] as const;

describe('parseImportConformanceInstrumentationMapping', () => {
  it('admits only declared capabilities with both sorted proof roles', () => {
    const mapping = parseImportConformanceInstrumentationMapping(
      {
        capabilities: [
          {
            fires: ['packages/swf/src/swfDocument.test.ts#reports loss'],
            id: 'swf.fill.solid',
            staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported input silent'],
          },
        ],
        count: 1,
      },
      DEFINITIONS,
    );
    expect(mapping.problems).toEqual([]);
    expect(mapping.proofs.get('swf.fill.solid')).toEqual({
      fires: ['packages/swf/src/swfDocument.test.ts#reports loss'],
      staysSilent: ['packages/swf/src/swfDocument.test.ts#keeps supported input silent'],
    });
  });

  it.each([
    { fires: [], staysSilent: ['test#silent'] },
    { fires: ['test#fires'], staysSilent: [] },
    { fires: ['z', 'a'], staysSilent: ['test#silent'] },
  ])('leaves a capability UNKNOWN when either proof role is invalid', (row) => {
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [{ id: 'swf.fill.solid', ...row }], count: 1 },
      DEFINITIONS,
    );
    expect(mapping.proofs.has('swf.fill.solid')).toBe(false);
    expect(mapping.problems).toHaveLength(1);
  });

  it('removes duplicated and undeclared rows instead of manufacturing instrumentation', () => {
    const row = {
      fires: ['test#fires'],
      id: 'swf.fill.solid',
      staysSilent: ['test#silent'],
    };
    const mapping = parseImportConformanceInstrumentationMapping(
      { capabilities: [row, row, { ...row, id: 'swf.unknown' }], count: 3 },
      DEFINITIONS,
    );
    expect(mapping.proofs.size).toBe(0);
    expect(mapping.problems).toHaveLength(2);
  });
});
