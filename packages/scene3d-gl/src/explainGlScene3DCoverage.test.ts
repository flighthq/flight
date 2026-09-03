import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D, createScene3DKindUsage, getScene3DKindUsage } from '@flighthq/scene3d/contract';
import { createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  GlMeshMaterialRenderer,
  GlRenderState,
  ImageResourceReference,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceReferenceKind,
  RenderRegistry,
  RequirementFacet,
  ResourceResolutionState,
  SceneCoverage,
  StandardMaterialKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainGlScene3DCoverage, hasGlScene3DCoverage } from './explainGlScene3DCoverage';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

const coverageCatalog: SceneCoverageCatalog = [
  {
    kind: 'ShadedMaterial',
    registrations: [{ module: '@flighthq/scene3d-gl', registrar: 'registerGlShadedMaterial' }],
    registry: RenderRegistry.MaterialRenderer,
  },
  {
    kind: 'image',
    registrations: [{ module: '@flighthq/scene3d-gl', registrar: 'registerGlImageTextureResolver' }],
    registry: RenderRegistry.TextureResolver,
  },
  {
    kind: 'RimModifier',
    registrations: [{ module: '@flighthq/scene3d-gl', registrar: 'registerGlRimModifier' }],
    registry: RenderRegistry.ModifierSnippet,
  },
];

function shamblerLikeScene(withModifier = false) {
  const ref: ImageResourceReference = {
    [EntityRuntimeKey]: undefined,
    alphaType: 'straight',
    bytes: new Uint8Array([1, 2, 3]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType: 'image/png',
    state: ResourceResolutionState.Unresolved,
  };
  const material = createShadedMaterial({ diffuseMap: createTexture({ resource: ref }) });
  if (withModifier) material.modifiers = [createRimModifier({ color: 0x49d8ffff, intensity: 0.7, power: 2.4 })];
  const scene = createScene3D();
  scene.resources.push(ref);
  addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [material]));
  const usage = createScene3DKindUsage();
  getScene3DKindUsage(usage, scene);
  return usage;
}

function gaps(state: GlRenderState, withModifier = false): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainGlScene3DCoverage(out, state, shamblerLikeScene(withModifier), coverageCatalog);
  return out;
}

const renderer: GlMeshMaterialRenderer = { bind() {}, draw() {} };

describe('explainGlScene3DCoverage', () => {
  it('reports a bare state with remedies for both unregistered requirements', () => {
    const found = gaps(makeGlScene3DState().state);
    expect(found).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      module: '@flighthq/scene3d-gl',
      registrar: 'registerGlShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
    expect(found).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneTextureSourceKind,
      kind: 'image',
      module: '@flighthq/scene3d-gl',
      registrar: 'registerGlImageTextureResolver',
      registry: RenderRegistry.TextureResolver,
    });
  });

  it('downgrades the material gap to Fallback once a standard renderer can absorb it', () => {
    // resolveGlMeshMaterialRenderer falls back to StandardMaterialKind, so the mesh still draws — as
    // the wrong material. That is a downgrade to report, not a silence and not full coverage.
    const state = makeGlScene3DState().state;
    registerGlMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(gaps(state)).toContainEqual({
      coverage: SceneCoverage.FallbackRemediable,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      module: '@flighthq/scene3d-gl',
      registrar: 'registerGlShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('reports the material as Satisfied once its own renderer is registered', () => {
    const state = makeGlScene3DState().state;
    registerGlMeshMaterialRenderer(state, 'ShadedMaterial', renderer);
    expect(gaps(state)).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
    expect(
      gaps(state).some((g) => g.coverage !== SceneCoverage.Satisfied && g.registry === RenderRegistry.MaterialRenderer),
    ).toBe(false);
  });

  it('reports an unregistered modifier snippet as actionable, never a fallback', () => {
    // The shaded compiler assembles base + modifiers into one program, so an absent snippet fails the
    // whole material rather than degrading it.
    const found = gaps(makeGlScene3DState().state, true);
    expect(found).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneModifierKind,
      kind: 'RimModifier',
      module: '@flighthq/scene3d-gl',
      registrar: 'registerGlRimModifier',
      registry: RenderRegistry.ModifierSnippet,
    });
  });

  it('never reports a node-kind gap, since 3D collects meshes structurally', () => {
    expect(gaps(makeGlScene3DState().state).some((g) => g.registry === RenderRegistry.NodeRenderer)).toBe(false);
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const state = makeGlScene3DState().state;
    const usage = shamblerLikeScene();
    const out: SceneCoverageEntry[] = [];
    explainGlScene3DCoverage(out, state, usage, coverageCatalog);
    const first = out.length;
    explainGlScene3DCoverage(out, state, usage, coverageCatalog);
    expect(out).toHaveLength(first);
  });
});

describe('hasGlScene3DCoverage', () => {
  it('is false for a bare state and stays false while any kind is unserved', () => {
    expect(hasGlScene3DCoverage(makeGlScene3DState().state, shamblerLikeScene())).toBe(false);
  });

  it('counts a standard-material fallback as uncovered, since the authored material would not appear', () => {
    const state = makeGlScene3DState().state;
    registerGlMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(hasGlScene3DCoverage(state, shamblerLikeScene())).toBe(false);
  });

  it('agrees with the explain tier on the same state, so the two can never disagree', () => {
    const state = makeGlScene3DState().state;
    registerGlMeshMaterialRenderer(state, 'ShadedMaterial', renderer);
    const usage = shamblerLikeScene();
    const out: SceneCoverageEntry[] = [];
    explainGlScene3DCoverage(out, state, usage, coverageCatalog);
    expect(hasGlScene3DCoverage(state, usage)).toBe(out.length === 0);
  });

  it('is true once nothing in the usage is unserved', () => {
    const state = makeGlScene3DState().state;
    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, createScene3D());
    expect(hasGlScene3DCoverage(state, usage)).toBe(true);
  });
});
