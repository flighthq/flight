import type { RequirementCatalogEntry, RequirementDisposition, RequirementTranslation } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  createRequirementCatalog,
  findRequirementCatalogEntries,
  getRequirementCatalogEntries,
  registerRequirementCatalogEntry,
  unregisterRequirementCatalogEntry,
} from './requirementCatalog.ts';

const first: RequirementCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'glShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerNodeRenderer',
};

// ★ EVERY OPTIONAL FIELD SET, WHICH `first` DELIBERATELY IS NOT. `first` omits `familyOrder`, and
// `toEqual` treats a missing key and a key holding `undefined` as the same thing — so the assertions
// written against `first` passed for the whole time `familyOrder` was being dropped. This fixture is what
// those assertions could not be made of, and the cases below compare it with `toStrictEqual`.
const populated: RequirementCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.DocumentFormat,
  familyOrder: 3,
  implementationImport: '@flighthq/scene3d-formats',
  implementationSymbol: 'colladaGeometryDecoder',
  kind: 'dae.Geometry',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerNodeRenderer',
};

describe('createRequirementCatalog', () => {
  it('creates an isolated empty catalog and copies supplied entries', () => {
    const source = [first];
    const catalog = createRequirementCatalog(source);
    source.length = 0;

    expect(catalog.entries).toEqual([first]);
    expect(createRequirementCatalog().entries).toEqual([]);
    expect(createRequirementCatalog().entries).not.toBe(createRequirementCatalog().entries);
  });

  it('carries every optional field, including familyOrder, through the copy', () => {
    expect(createRequirementCatalog([populated]).entries).toStrictEqual([populated]);
  });

  // ★ THE GUARD AGAINST THIS HAPPENING AGAIN. The cases above pin the fields that exist TODAY, so they
  // would all pass again the day a sixth field is added and forgotten. This one pins the MECHANISM: it
  // sends a key the copier has never heard of and requires it to arrive. A copier rebuilt as a field list
  // cannot satisfy this, whatever its list happens to contain.
  it('carries a field the copier does not know about, so a future one cannot be dropped', () => {
    // `as unknown as` because the whole point is a field the type does not declare — no narrower
    // assertion can describe a contract addition that has not been made yet.
    const future = { ...populated, fieldAddedLater: 'survived' } as unknown as RequirementCatalogEntry;
    const copied = createRequirementCatalog([future]).entries[0] as unknown as Record<string, unknown>;
    expect(copied.fieldAddedLater).toBe('survived');
  });

  it('detaches each row, so mutating the caller\u2019s object afterwards cannot reach the catalog', () => {
    const source = { ...populated };
    const catalog = createRequirementCatalog([source]);
    source.familyOrder = 99;
    source.implementationSymbol = 'mutated';
    expect(catalog.entries[0]).toStrictEqual(populated);
    expect(catalog.entries[0]).not.toBe(source);
  });

  it('copies translations deeply, so the nested requirements are not shared with the caller', () => {
    const translation: RequirementTranslation = {
      from: { facet: RequirementFacet.DocumentFormat, key: 'dae.Material' },
      to: [{ facet: RequirementFacet.SceneMaterialKind, key: 'StandardPbr' }],
    };
    const catalog = createRequirementCatalog([], [translation]);
    // Bound once rather than asserted at each use: `translations` is optional on RequirementCatalog, and
    // createRequirementCatalog always supplies it.
    const copied = catalog.translations!;
    expect(copied).toStrictEqual([translation]);
    expect(copied[0].from).not.toBe(translation.from);
    expect(copied[0].to[0]).not.toBe(translation.to[0]);
  });

  it('copies dispositions, detached from the caller', () => {
    const disposition: RequirementDisposition = {
      backend: 'dom',
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'StandardPbr',
      reason: 'the DOM backend draws no lit surfaces',
    };
    const catalog = createRequirementCatalog([], [], [disposition]);
    const copied = catalog.dispositions!;
    expect(copied).toStrictEqual([disposition]);
    expect(copied[0]).not.toBe(disposition);
  });
});

describe('findRequirementCatalogEntries', () => {
  it('looks up every row by backend, facet, and kind and returns detached values', () => {
    const catalog = createRequirementCatalog([first]);
    const entries = findRequirementCatalogEntries(catalog, 'webgl', RequirementFacet.SceneNodeKind, 'Shape');
    expect(entries).toEqual([first]);
    expect(entries[0]).not.toBe(catalog.entries[0]);
    expect(findRequirementCatalogEntries(catalog, 'webgpu', RequirementFacet.SceneNodeKind, 'Shape')).toEqual([]);
  });

  it('returns every optional field of a matched row, since a lookup that loses one resolves wrongly', () => {
    const catalog = createRequirementCatalog([populated]);
    expect(
      findRequirementCatalogEntries(catalog, 'webgl', RequirementFacet.DocumentFormat, 'dae.Geometry'),
    ).toStrictEqual([populated]);
  });
});

describe('getRequirementCatalogEntries', () => {
  it('returns a detached ordered snapshot', () => {
    const catalog = createRequirementCatalog([first]);
    const snapshot = getRequirementCatalogEntries(catalog);
    expect(getRequirementCatalogEntries(catalog)).toEqual([first]);
    expect(snapshot).not.toBe(catalog.entries);
    expect(snapshot[0]).not.toBe(catalog.entries[0]);
  });

  // This is the flow the emitter reads through, so a field lost here is a field lost from the generated
  // module — which is how the alphabetical parser order got out.
  it('returns every optional field, which is what the codegen plan reads', () => {
    expect(getRequirementCatalogEntries(createRequirementCatalog([populated]))).toStrictEqual([populated]);
  });
});

describe('registerRequirementCatalogEntry', () => {
  it('replaces a matching key in place and copies caller data', () => {
    const catalog = createRequirementCatalog([first]);
    const replacement: RequirementCatalogEntry = {
      ...first,
      implementationImport: '@acme/gl',
      implementationSymbol: 'defaultAcmeShapeRenderer',
    };
    registerRequirementCatalogEntry(catalog, replacement);

    expect(catalog.entries).toEqual([replacement]);
  });

  it('preserves multiple registrar rows for one requirement', () => {
    const catalog = createRequirementCatalog([first]);
    const commands = {
      ...first,
      registrarImport: '@flighthq/scene2d-gl',
      registrarSymbol: 'registerGlShapeCommands',
    };
    registerRequirementCatalogEntry(catalog, commands);
    expect(catalog.entries).toEqual([first, commands]);
  });

  it('keeps every optional field when a row replaces one already registered', () => {
    const catalog = createRequirementCatalog([{ ...populated, familyOrder: 0 }]);
    registerRequirementCatalogEntry(catalog, populated);
    expect(catalog.entries).toStrictEqual([populated]);
  });

  it('keeps every optional field of a newly appended row', () => {
    const catalog = createRequirementCatalog();
    registerRequirementCatalogEntry(catalog, populated);
    expect(catalog.entries).toStrictEqual([populated]);
    expect(catalog.entries[0]).not.toBe(populated);
  });
});
describe('unregisterRequirementCatalogEntry', () => {
  it('removes only the requested kind and registry', () => {
    const catalog = createRequirementCatalog([first]);
    expect(unregisterRequirementCatalogEntry(catalog, { ...first, registrarSymbol: 'unknown' })).toBe(false);
    expect(unregisterRequirementCatalogEntry(catalog, first)).toBe(true);
    expect(catalog.entries).toEqual([]);
  });
});
