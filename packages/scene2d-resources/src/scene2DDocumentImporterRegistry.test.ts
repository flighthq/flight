import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createScene2DDocument } from './scene2DDocument';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
  initializeScene2DDocumentImporterRegistry,
  registerScene2DDocumentImporter,
  unregisterScene2DDocumentImporter,
} from './scene2DDocumentImporterRegistry';

describe('createScene2DDocumentFromBytes', () => {
  it('dispatches to the first matching registered importer', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerScene2DDocumentImporter(
      registry,
      'acme',
      (source) => source[0] === 42,
      () => createScene2DDocument(createDisplayObject()),
    );
    const document = createScene2DDocumentFromBytes(new Uint8Array([42]), registry);
    expect(document?.sourceKind).toBe('acme');
  });

  it('returns null when no importer matches', () => {
    expect(createScene2DDocumentFromBytes(new Uint8Array([0]), createScene2DDocumentImporterRegistry())).toBeNull();
  });
});

describe('createScene2DDocumentImporterRegistry', () => {
  it('creates isolated registries with no implicit codecs', () => {
    const first = createScene2DDocumentImporterRegistry();
    const second = createScene2DDocumentImporterRegistry();
    expect(first.entries).toEqual([]);
    expect(second.entries).not.toBe(first.entries);
  });
});

describe('initializeScene2DDocumentImporterRegistry', () => {
  it('is the construction initializer of createScene2DDocumentImporterRegistry', () => {
    expect(typeof initializeScene2DDocumentImporterRegistry).toBe('function');
  });
});

describe('registerScene2DDocumentImporter', () => {
  it('replaces a kind in place with last-write-wins behavior', () => {
    const registry = createScene2DDocumentImporterRegistry();
    const first = () => null;
    const second = () => createScene2DDocument(createDisplayObject());
    registerScene2DDocumentImporter(registry, 'acme', () => true, first);
    registerScene2DDocumentImporter(registry, 'acme', () => true, second);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].importDocument).toBe(second);
  });
});
describe('unregisterScene2DDocumentImporter', () => {
  it('removes an existing kind and reports absence', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerScene2DDocumentImporter(
      registry,
      'acme',
      () => true,
      () => null,
    );
    expect(unregisterScene2DDocumentImporter(registry, 'acme')).toBe(true);
    expect(unregisterScene2DDocumentImporter(registry, 'acme')).toBe(false);
  });
});
