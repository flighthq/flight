import { createRequirementSet } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { readRequirementCatalogFile, readRequirementSetFile, writeRequirementSetFile } from './requirementSetFile.ts';

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
    // The registrar pair is NOT listed: it is optional, because an options-driven lane has no
    // `register*` to name and every row this repo ships omits it.
    expect(readRequirementCatalogFile(JSON.stringify({ entries: [{ backend: 'canvas' }] })).problems).toEqual([
      'entries[0] needs string facet, kind, implementationImport, implementationSymbol',
    ]);
  });

  // ★ `parserExport` IS THE WHOLE OF A DIRECT-PARSER ROW, so the CLI lane has to carry it or it reaches the same
  // catalog with every bedrock selection quietly missing. A reader that dropped it would still produce a catalog
  // that parses, with the right entry count, and no diagnostic — the shape of failure this preserves against.
  it('preserves parserExport through a round trip', () => {
    const entry = {
      backend: 'parser',
      facet: 'document.format',
      implementationImport: '@flighthq/tilemap-formats',
      implementationSymbol: 'parseTiledTmx',
      kind: 'tilemap.TiledTmx',
      parserExport: 'contentParser',
    };

    const result = readRequirementCatalogFile(JSON.stringify({ entries: [entry] }));

    expect(result.problems).toEqual([]);
    expect(result.catalog!.entries[0].parserExport).toBe('contentParser');
    // The round trip in full: re-serializing what was read reproduces the row it was read from.
    expect(JSON.parse(JSON.stringify(result.catalog!.entries[0]))).toEqual(entry);
  });

  // A handler row has no parserExport, and must not gain one — an empty string here would read as a binding
  // named '' rather than as the absence of a direct-parser selection.
  it('leaves parserExport absent on a row that never had one', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            facet: 'document.format',
            implementationImport: '@flighthq/swf',
            implementationSymbol: 'swfDefineShapeHandler',
            kind: 'swf.DefineShape',
          },
        ],
      }),
    );

    expect(result.problems).toEqual([]);
    expect('parserExport' in result.catalog!.entries[0]).toBe(false);
  });

  it.each([
    ['a number', 7],
    ['a null', null],
    ['an object', { name: 'contentParser' }],
    ['an array', ['contentParser']],
  ])('rejects %s parserExport by index rather than dropping it', (_label, value) => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            facet: 'document.format',
            implementationImport: '@flighthq/tilemap-formats',
            implementationSymbol: 'parseTiledTmx',
            kind: 'tilemap.TiledTmx',
            parserExport: value,
          },
        ],
      }),
    );

    expect(result.catalog).toBeNull();
    expect(result.problems).toEqual(['entries[0] parserExport must be a string when present']);
  });

  // ★ THE INPUT KIND DECIDES WHICH OF TWO BINDINGS IS EMITTED, so the CLI lane has to carry it for the same
  // reason it carries `parserExport`: a catalog that lost it would still parse, still select the right parser,
  // and hand that parser the wrong argument shape.
  it('preserves contentParserInputKind through a round trip', () => {
    const entry = {
      backend: 'parser',
      contentParserInputKind: 'string',
      facet: 'document.format',
      implementationImport: '@flighthq/tilemap-formats',
      implementationSymbol: 'parseTiledTmx',
      kind: 'tilemap.TiledTmx',
      parserExport: 'contentParser',
    };

    const result = readRequirementCatalogFile(JSON.stringify({ entries: [entry] }));

    expect(result.problems).toEqual([]);
    expect(result.catalog!.entries[0].contentParserInputKind).toBe('string');
    expect(JSON.parse(JSON.stringify(result.catalog!.entries[0]))).toEqual(entry);
  });

  it('preserves the bytes input kind as readily as the string one', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            contentParserInputKind: 'bytes',
            facet: 'document.format',
            implementationImport: '@flighthq/bitmapfont-formats',
            implementationSymbol: 'parseBitmapFontBinary',
            kind: 'bitmapfont.BmFontBinary',
            parserExport: 'contentParser',
          },
        ],
      }),
    );

    expect(result.problems).toEqual([]);
    expect(result.catalog!.entries[0].contentParserInputKind).toBe('bytes');
  });

  it('leaves contentParserInputKind absent on a row that never had one', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            facet: 'document.format',
            implementationImport: '@flighthq/swf',
            implementationSymbol: 'swfDefineShapeHandler',
            kind: 'swf.DefineShape',
          },
        ],
      }),
    );

    expect(result.problems).toEqual([]);
    expect('contentParserInputKind' in result.catalog!.entries[0]).toBe(false);
  });

  // ★ CHECKED AGAINST ITS TWO LEGAL VALUES, NOT MERELY AGAINST `string`. A typo like 'text' or 'byte' is a
  // string, so a `typeof` check would accept it and the emitter would silently pick the other convention.
  it.each([
    ['a near-miss spelling', 'text'],
    ['the singular', 'byte'],
    ['a number', 3],
    ['a null', null],
    ['an array', ['string']],
  ])('rejects %s contentParserInputKind by index rather than dropping it', (_label, value) => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            contentParserInputKind: value,
            facet: 'document.format',
            implementationImport: '@flighthq/tilemap-formats',
            implementationSymbol: 'parseTiledTmx',
            kind: 'tilemap.TiledTmx',
            parserExport: 'contentParser',
          },
        ],
      }),
    );

    expect(result.catalog).toBeNull();
    expect(result.problems).toEqual(['entries[0] contentParserInputKind must be bytes or string when present']);
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

  // ★ THE CLI MUST REACH THE SAME VERDICT AS THE PLUGIN. A gap the catalog already settled, reported
  // by the CLI only because the decision lived in a field the reader ignored, is a parity bug rather
  // than a finding.
  it('reads dispositions, so the CLI can tell a decision from an oversight', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        dispositions: [{ backend: 'dom', facet: 'scene.node-kind', kind: 'Tilemap', reason: 'no DOM tilemap path' }],
        entries: [],
      }),
    );
    expect(result.problems).toEqual([]);
    expect(result.catalog?.dispositions).toEqual([
      { backend: 'dom', facet: 'scene.node-kind', kind: 'Tilemap', reason: 'no DOM tilemap path' },
    ]);
  });

  // A disposition with nothing to say is a suppression list, so an empty reason is rejected by index
  // rather than skipped: dropping it silently would turn a typo into an unexplained warning later.
  it('rejects a disposition whose reason is empty', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        dispositions: [{ backend: 'dom', facet: 'scene.node-kind', kind: 'Tilemap', reason: '' }],
        entries: [],
      }),
    );
    expect(result.catalog).toBeNull();
    expect(result.problems).toEqual(['dispositions[0] needs a non-empty reason']);
  });

  it('rejects a disposition missing a field, naming which', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({ dispositions: [{ backend: 'dom', kind: 'Tilemap' }], entries: [] }),
    );
    expect(result.catalog).toBeNull();
    expect(result.problems).toEqual(['dispositions[0] needs string facet, reason']);
  });

  // The rows this repo itself ships carry no registrar — a tag family is named in parse options, never
  // registered — so requiring one rejected `tool-registry catalog --json` feeding `tool-manifest plan`.
  it('accepts a row with no registrar, which is what the shipped catalog looks like', () => {
    const result = readRequirementCatalogFile(
      JSON.stringify({
        entries: [
          {
            backend: 'parser',
            facet: 'document.format',
            implementationImport: '@flighthq/swf',
            implementationSymbol: 'swfDefineShapeHandler',
            kind: 'swf.DefineShape',
          },
        ],
      }),
    );
    expect(result.problems).toEqual([]);
    expect(result.catalog?.entries[0]?.registrarSymbol).toBeUndefined();
  });
});
