import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRequirementCatalog } from '@flighthq/requirement-catalog/contract';
import type { RequirementCatalogEntry, RequirementSet } from '@flighthq/types/contract';
import { EntityRuntimeKey, RequirementFacet } from '@flighthq/types/contract';

import { createRequirementCodegenPlan, initializeRequirementCodegenPlan } from './requirementCodegen';

const shapeRenderer: RequirementCatalogEntry = {
  backend: 'webgl',
  facet: RequirementFacet.SceneNodeKind,
  implementationImport: '@flighthq/scene2d-gl',
  implementationSymbol: 'glShapeRenderer',
  kind: 'Shape',
  registrarImport: '@flighthq/render',
  registrarSymbol: 'registerNodeRenderer',
};

const shapeCommands: RequirementCatalogEntry = {
  ...shapeRenderer,
  registrarImport: '@flighthq/scene2d-gl',
  registrarSymbol: 'registerGlShapeCommands',
};

describe('createRequirementCodegenPlan', () => {
  it('selects the matching backend rows in requirement and catalog order', () => {
    const catalog = createRequirementCatalog([shapeRenderer, shapeCommands, { ...shapeRenderer, backend: 'webgpu' }]);
    const requirements = (() => {
      const out = allocateEntity<RequirementSet>();
      out.covers = [RequirementFacet.SceneNodeKind];
      out.requirements = [
        { facet: RequirementFacet.SceneNodeKind, key: 'Shape' },
        { facet: RequirementFacet.SceneNodeKind, key: 'Sprite' },
      ];
      return finishEntity(out);
    })();

    const plan = createRequirementCodegenPlan(catalog, requirements, 'webgl');
    expect(EntityRuntimeKey in plan).toBe(true);
    expect(plan).toMatchObject({
      backend: 'webgl',
      entries: [shapeRenderer, shapeCommands],
      unresolved: [{ facet: RequirementFacet.SceneNodeKind, key: 'Sprite' }],
    });
  });

  it('deduplicates repeated positive requirements without treating covers as requests', () => {
    const catalog = createRequirementCatalog([shapeRenderer]);
    const requirement = { facet: RequirementFacet.SceneNodeKind, key: 'Shape' } as const;
    const requirements = (() => {
      const out = allocateEntity<RequirementSet>();
      out.covers = [RequirementFacet.SceneNodeKind, RequirementFacet.SceneShapeCommand];
      out.requirements = [requirement, requirement];
      return finishEntity(out);
    })();

    expect(createRequirementCodegenPlan(catalog, requirements, 'webgl')).toMatchObject({
      backend: 'webgl',
      entries: [shapeRenderer],
      unresolved: [],
    });
  });

  it('returns an empty plan for empty catalog contents and requirements', () => {
    expect(
      createRequirementCodegenPlan(
        createRequirementCatalog(),
        (() => {
          const out = allocateEntity<any>();
          out.covers = [];
          out.requirements = [];
          return finishEntity(out);
        })(),
        'webgl',
      ),
    ).toMatchObject({
      backend: 'webgl',
      entries: [],
      unresolved: [],
    });
  });
});
describe('initializeRequirementCodegenPlan', () => {
  it('is the construction initializer of createRequirementCodegenPlan', () => {
    expect(typeof initializeRequirementCodegenPlan).toBe('function');
  });
});
