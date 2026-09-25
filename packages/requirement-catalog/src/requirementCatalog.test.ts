import type { RequirementCatalogEntry } from '@flighthq/types/contract';
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

describe('createRequirementCatalog', () => {
  it('creates an isolated empty catalog and copies supplied entries', () => {
    const source = [first];
    const catalog = createRequirementCatalog(source);
    source.length = 0;

    expect(catalog.entries).toEqual([first]);
    expect(createRequirementCatalog().entries).toEqual([]);
    expect(createRequirementCatalog().entries).not.toBe(createRequirementCatalog().entries);
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
});

describe('getRequirementCatalogEntries', () => {
  it('returns a detached ordered snapshot', () => {
    const catalog = createRequirementCatalog([first]);
    const snapshot = getRequirementCatalogEntries(catalog);
    expect(getRequirementCatalogEntries(catalog)).toEqual([first]);
    expect(snapshot).not.toBe(catalog.entries);
    expect(snapshot[0]).not.toBe(catalog.entries[0]);
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
});
describe('unregisterRequirementCatalogEntry', () => {
  it('removes only the requested kind and registry', () => {
    const catalog = createRequirementCatalog([first]);
    expect(unregisterRequirementCatalogEntry(catalog, { ...first, registrarSymbol: 'unknown' })).toBe(false);
    expect(unregisterRequirementCatalogEntry(catalog, first)).toBe(true);
    expect(catalog.entries).toEqual([]);
  });
});
