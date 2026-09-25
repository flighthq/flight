import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRequirementCatalog } from '@flighthq/requirement-catalog/contract';
import type {
  Requirement,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementDisposition,
  RequirementSet,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RequirementFacet } from '@flighthq/types/contract';

import { createRequirementCodegenPlan, initializeRequirementCodegenPlan } from './requirementCodegen.ts';

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
describe('createRequirementCodegenPlan with dispositions', () => {
  it('routes a disposed requirement to declined rather than unresolved, carrying the reason', () => {
    const plan = createRequirementCodegenPlan(
      disposedCatalog([], [disposition('dom', 'Tilemap', 'no DOM tilemap path')]),
      disposedSet([disposedRequirement('Tilemap')]),
      'dom',
    );

    expect(plan.unresolved).toEqual([]);
    expect(plan.declined).toEqual([
      { reason: 'no DOM tilemap path', requirement: { facet: RequirementFacet.SceneNodeKind, key: 'Tilemap' } },
    ]);
  });

  // The whole point: a decision and an oversight must not look alike.
  it('leaves an undisposed gap in unresolved, so an oversight still reports', () => {
    const plan = createRequirementCodegenPlan(
      disposedCatalog([], []),
      disposedSet([disposedRequirement('Tilemap')]),
      'dom',
    );
    expect(plan.declined).toEqual([]);
    expect(plan.unresolved).toEqual([{ facet: RequirementFacet.SceneNodeKind, key: 'Tilemap' }]);
  });

  // ★ EXACTNESS, ONE AXIS AT A TIME. A disposition names one backend, one facet and one kind. If any
  // of the three were matched loosely it would silence requirements nobody considered, which is the
  // failure this feature exists to prevent rather than introduce.
  it('does not apply to another backend', () => {
    const c = disposedCatalog([], [disposition('dom', 'Tilemap', 'no DOM tilemap path')]);
    expect(createRequirementCodegenPlan(c, disposedSet([disposedRequirement('Tilemap')]), 'canvas').unresolved).toEqual(
      [{ facet: RequirementFacet.SceneNodeKind, key: 'Tilemap' }],
    );
  });

  it('does not apply to another kind', () => {
    const c = disposedCatalog([], [disposition('dom', 'Tilemap', 'no DOM tilemap path')]);
    expect(createRequirementCodegenPlan(c, disposedSet([disposedRequirement('QuadBatch')]), 'dom').unresolved).toEqual([
      { facet: RequirementFacet.SceneNodeKind, key: 'QuadBatch' },
    ]);
  });

  it('does not apply to another facet', () => {
    const c = disposedCatalog(
      [],
      [{ ...disposition('dom', 'Tilemap', 'no DOM tilemap path'), facet: RequirementFacet.DocumentFormat }],
    );
    expect(createRequirementCodegenPlan(c, disposedSet([disposedRequirement('Tilemap')]), 'dom').unresolved).toEqual([
      { facet: RequirementFacet.SceneNodeKind, key: 'Tilemap' },
    ]);
  });

  it('emits no entry for a declined requirement, so nothing is imported or registered for it', () => {
    const plan = createRequirementCodegenPlan(
      disposedCatalog([], [disposition('dom', 'Tilemap', 'no DOM tilemap path')]),
      disposedSet([disposedRequirement('Tilemap')]),
      'dom',
    );
    expect(plan.entries).toEqual([]);
  });

  // A disposition is a fallback for a gap, never an override: if the backend CAN satisfy it, it does.
  it('never overrides a row that actually resolves', () => {
    const plan = createRequirementCodegenPlan(
      disposedCatalog([disposedEntry('dom', 'Tilemap')], [disposition('dom', 'Tilemap', 'stale decision')]),
      disposedSet([disposedRequirement('Tilemap')]),
      'dom',
    );
    expect(plan.entries.map((e) => e.implementationSymbol)).toEqual(['domTilemapRenderer']);
    expect(plan.declined).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it('reports one requirement declined and another missing in the same plan', () => {
    const plan = createRequirementCodegenPlan(
      disposedCatalog([], [disposition('dom', 'Tilemap', 'no DOM tilemap path')]),
      disposedSet([disposedRequirement('Tilemap'), disposedRequirement('QuadBatch')]),
      'dom',
    );
    expect(plan.declined.map((d) => d.requirement.key)).toEqual(['Tilemap']);
    expect(plan.unresolved.map((r) => r.key)).toEqual(['QuadBatch']);
  });
});

describe('initializeRequirementCodegenPlan', () => {
  it('is the construction initializer of createRequirementCodegenPlan', () => {
    expect(typeof initializeRequirementCodegenPlan).toBe('function');
  });
});

function disposedRequirement(kind: string): Requirement {
  return { facet: RequirementFacet.SceneNodeKind, key: kind };
}

// Built the way every other set in this file is built, so the test needs no dependency the package
// does not already declare.
function disposedSet(requirements: readonly Requirement[]): RequirementSet {
  const out = allocateEntity<RequirementSet>();
  out.covers = [RequirementFacet.SceneNodeKind];
  out.requirements = [...requirements];
  return finishEntity(out);
}

function disposition(backend: string, kind: string, reason: string): RequirementDisposition {
  return { backend, facet: RequirementFacet.SceneNodeKind, kind, reason };
}

function disposedEntry(backend: string, kind: string): RequirementCatalogEntry {
  return {
    backend,
    facet: RequirementFacet.SceneNodeKind,
    implementationImport: '@flighthq/scene2d-dom',
    implementationSymbol: `${backend}${kind}Renderer`,
    kind,
  };
}

function disposedCatalog(
  entries: readonly RequirementCatalogEntry[],
  dispositions: readonly RequirementDisposition[],
): RequirementCatalog {
  return { dispositions: [...dispositions], entries: [...entries] };
}
