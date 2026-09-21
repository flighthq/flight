import type { RegistryCatalogEntry } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { formatBuiltInRegistryCatalogSource, verifyRegistryCatalogEntries } from './catalog-core';

const entry: RegistryCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'glShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerNodeRenderer',
};

describe('formatBuiltInRegistryCatalogSource', () => {
  it('formats a non-empty inventory as typed deterministic source', () => {
    const source = formatBuiltInRegistryCatalogSource([entry]);
    expect(source).toContain('readonly RegistryCatalogEntry[]');
    expect(source).toContain('"implementationSymbol": "glShapeRenderer"');
  });
});

describe('verifyRegistryCatalogEntries', () => {
  it('accepts distinct complete factual rows', () => {
    expect(verifyRegistryCatalogEntries([entry, { ...entry, registrarSymbol: 'registerGlShapeCommands' }])).toEqual([]);
  });

  it('rejects duplicate row identities and empty fields', () => {
    expect(verifyRegistryCatalogEntries([entry, entry, { ...entry, implementationSymbol: '' }])).toEqual([
      'duplicate row: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
      'empty implementationSymbol: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
      'duplicate row: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
    ]);
  });
});
