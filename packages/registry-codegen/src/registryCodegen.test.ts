import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRegistryCatalog } from '@flighthq/registry-catalog/contract';
import type { RegistryCatalogEntry, RequirementSet } from '@flighthq/types/contract';
import { EntityRuntimeKey, RequirementFacet } from '@flighthq/types/contract';

import { createRegistryCodegenPlan } from './registryCodegen';

const shapeRenderer: RegistryCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'defaultGlShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerRenderer',
};

const shapeCommands: RegistryCatalogEntry = {
  ...shapeRenderer,
  registrarImport: '@flighthq/scene2d-gl',
  registrarSymbol: 'registerGlShapeCommands',
};

describe('createRegistryCodegenPlan', () => {
  it('selects the matching backend rows in requirement and catalog order', () => {
    const catalog = createRegistryCatalog([shapeRenderer, shapeCommands, { ...shapeRenderer, backend: 'webgpu' }]);
    const requirements = (() => {
      const out = allocateEntity<RequirementSet>();
      out.covers = [RequirementFacet.SceneNodeKind];
      out.requirements = [
        { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
        { facet: RequirementFacet.SceneNodeKind, key: 'Sprite' },
      ];
      return finishEntity(out);
    })();

    const plan = createRegistryCodegenPlan(catalog, requirements, 'webgl');
    expect(EntityRuntimeKey in plan).toBe(true);
    expect(plan).toMatchObject({
      backend: 'webgl',
      entries: [shapeRenderer, shapeCommands],
      unresolved: [{ facet: RequirementFacet.SceneNodeKind, key: 'Sprite' }],
    });
  });

  it('deduplicates repeated positive requirements without treating covers as requests', () => {
    const catalog = createRegistryCatalog([shapeRenderer]);
    const requirement = { facet: RequirementFacet.SceneNodeKind, key: 'Shape' } as const;
    const requirements = (() => {
      const out = allocateEntity<RequirementSet>();
      out.covers = [RequirementFacet.SceneNodeKind, RequirementFacet.SceneShapeCommand];
      out.requirements = [requirement, requirement];
      return finishEntity(out);
    })();

    expect(createRegistryCodegenPlan(catalog, requirements, 'webgl')).toMatchObject({
      backend: 'webgl',
      entries: [shapeRenderer],
      unresolved: [],
    });
  });

  it('returns an empty plan for empty catalog contents and requirements', () => {
    expect(
      createRegistryCodegenPlan(createRegistryCatalog(), (() => { const out = allocateEntity<unknown>(); out.covers = []; out.requirements = []; return finishEntity(out); })(), 'webgl'),
    ).toMatchObject({
      backend: 'webgl',
      entries: [],
      unresolved: [],
    });
  });
});
