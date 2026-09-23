import { createRequirementSet } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { readRequirementCatalogFile, readRequirementSetFile, writeRequirementSetFile } from './requirementSetFile.js';

describe('readRequirementCatalogFile', () => {
  it('reads entries and reports a malformed row by index rather than dropping it', () => {
    expect(
      readRequirementCatalogFile(
        JSON.stringify({
          entries: [
            {
              backend: 'canvas',
              facet: 'document.format',
              implementationImport: '@flighthq/swf',
              implementationSymbol: 'swfDefineShapeHandler',
              kind: 'DefineShape',
              registrarImport: '@flighthq/swf',
              registrarSymbol: 'registerSwfShapeTags',
            },
          ],
        }),
      ).catalog!.entries,
    ).toHaveLength(1);
    expect(readRequirementCatalogFile(JSON.stringify({ entries: [{ backend: 'canvas' }] })).problems).toEqual([
      'entries[0] needs string facet, kind, implementationImport, implementationSymbol, registrarImport, registrarSymbol',
    ]);
  });

  it('rejects text that is not a catalog', () => {
    expect(readRequirementCatalogFile('{').catalog).toBeNull();
    expect(readRequirementCatalogFile('[]').problems).toEqual(['catalog must be an object']);
  });
});

describe('readRequirementSetFile', () => {
  it('round-trips a set written by writeRequirementSetFile', () => {
    const set = createRequirementSet(
      [RequirementFacet.DocumentFormat],
      [{ facet: RequirementFacet.DocumentFormat, key: 'DefineShape' }],
    );
    const read = readRequirementSetFile(writeRequirementSetFile(set)).requirementSet!;
    expect(read.covers).toEqual(set.covers);
    expect(read.requirements).toEqual(set.requirements);
  });

  it('reports a lossy row instead of silently shrinking the inventory', () => {
    const validation = readRequirementSetFile(
      JSON.stringify({ covers: ['document.format'], requirements: [{ facet: 'document.format' }] }),
    );
    expect(validation.requirementSet).toBeNull();
    expect(validation.problems).toEqual(['requirements[0] needs string facet and key']);
  });

  it('rejects text that is not a requirement set', () => {
    expect(readRequirementSetFile('nope').requirementSet).toBeNull();
    expect(readRequirementSetFile(JSON.stringify({ covers: [] })).problems).toEqual(['requirements must be an array']);
  });
});

describe('writeRequirementSetFile', () => {
  it('writes only the two public fields, not the entity runtime', () => {
    const set = createRequirementSet(
      [RequirementFacet.DocumentFormat],
      [{ facet: RequirementFacet.DocumentFormat, key: 'Material' }],
    );
    expect(JSON.parse(writeRequirementSetFile(set))).toEqual({
      covers: ['document.format'],
      requirements: [{ facet: 'document.format', key: 'Material' }],
    });
  });
});
