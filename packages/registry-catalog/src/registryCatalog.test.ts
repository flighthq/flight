import type { RegistryCatalogEntry } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  createRegistryCatalog,
  findRegistryCatalogEntries,
  getRegistryCatalogEntries,
  initializeRegistryCatalog,
  registerRegistryCatalogEntry,
  unregisterRegistryCatalogEntry,
} from './registryCatalog';

const first: RegistryCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'defaultGlShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerRenderer',
};

describe('createRegistryCatalog', () => {
  it('creates an isolated empty catalog and copies supplied entries', () => {
    const source = [first];
    const catalog = createRegistryCatalog(source);
    source.length = 0;

    expect(catalog.entries).toEqual([first]);
    expect(createRegistryCatalog().entries).toEqual([]);
    expect(createRegistryCatalog().entries).not.toBe(createRegistryCatalog().entries);
  });
});

describe('findRegistryCatalogEntries', () => {
  it('looks up every row by backend, facet, and kind and returns detached values', () => {
    const catalog = createRegistryCatalog([first]);
    const entries = findRegistryCatalogEntries(catalog, 'webgl', RequirementFacet.SceneNodeKind, 'Shape');
    expect(entries).toEqual([first]);
    expect(entries[0]).not.toBe(catalog.entries[0]);
    expect(findRegistryCatalogEntries(catalog, 'webgpu', RequirementFacet.SceneNodeKind, 'Shape')).toEqual([]);
  });
});

describe('getRegistryCatalogEntries', () => {
  it('returns a detached ordered snapshot', () => {
    const catalog = createRegistryCatalog([first]);
    const snapshot = getRegistryCatalogEntries(catalog);
    expect(getRegistryCatalogEntries(catalog)).toEqual([first]);
    expect(snapshot).not.toBe(catalog.entries);
    expect(snapshot[0]).not.toBe(catalog.entries[0]);
  });
});

describe('initializeRegistryCatalog', () => {
  it('is the construction initializer of createRegistryCatalog', () => {
    expect(typeof initializeRegistryCatalog).toBe('function');
  });
});

describe('registerRegistryCatalogEntry', () => {
  it('replaces a matching key in place and copies caller data', () => {
    const catalog = createRegistryCatalog([first]);
    const replacement: RegistryCatalogEntry = {
      ...first,
      implementationImport: '@acme/gl',
      implementationSymbol: 'defaultAcmeShapeRenderer',
    };
    registerRegistryCatalogEntry(catalog, replacement);

    expect(catalog.entries).toEqual([replacement]);
  });

  it('preserves multiple registrar rows for one requirement', () => {
    const catalog = createRegistryCatalog([first]);
    const commands = {
      ...first,
      registrarImport: '@flighthq/scene2d-gl',
      registrarSymbol: 'registerGlShapeCommands',
    };
    registerRegistryCatalogEntry(catalog, commands);
    expect(catalog.entries).toEqual([first, commands]);
  });
});
describe('unregisterRegistryCatalogEntry', () => {
  it('removes only the requested kind and registry', () => {
    const catalog = createRegistryCatalog([first]);
    expect(unregisterRegistryCatalogEntry(catalog, { ...first, registrarSymbol: 'unknown' })).toBe(false);
    expect(unregisterRegistryCatalogEntry(catalog, first)).toBe(true);
    expect(catalog.entries).toEqual([]);
  });
});
