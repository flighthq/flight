import type { RequirementCatalogEntry } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { formatBuiltInRequirementCatalogSource, verifyRequirementCatalogEntries } from './catalog-core';

const entry: RequirementCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'glShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerNodeRenderer',
};

describe('formatBuiltInRequirementCatalogSource', () => {
  it('formats a non-empty inventory as typed deterministic source', () => {
    const source = formatBuiltInRequirementCatalogSource([entry]);
    expect(source).toContain('readonly RequirementCatalogEntry[]');
    // Repository source style, NOT JSON: a JSON-shaped file is rewritten by `npm run fix` on contact,
    // which leaves `catalog --check` permanently stale.
    expect(source).toContain("implementationSymbol: 'glShapeRenderer',");
    expect(source).not.toContain('"implementationSymbol"');
  });
});

describe('verifyRequirementCatalogEntries', () => {
  it('accepts distinct complete factual rows', () => {
    expect(verifyRequirementCatalogEntries([entry, { ...entry, registrarSymbol: 'registerGlShapeCommands' }])).toEqual(
      [],
    );
  });

  it('rejects duplicate row identities and empty fields', () => {
    expect(verifyRequirementCatalogEntries([entry, entry, { ...entry, implementationSymbol: '' }])).toEqual([
      'duplicate row: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
      'empty implementationSymbol: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
      'duplicate row: webgl:scene.node-kind:Shape:@flighthq/render:registerNodeRenderer',
    ]);
  });
});
