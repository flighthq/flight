import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D, createScene3DKindUsage, getScene3DKindUsage } from '@flighthq/scene3d/contract';
import { createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  ImageResourceReference,
  Scene3DKindUsage,
  SceneCoverageCatalog,
  SceneCoverageEntry,
  WgpuRenderState,
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

import { explainWgpuScene3DCoverage, hasWgpuScene3DCoverage } from './explainWgpuScene3DCoverage';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

const coverageCatalog: SceneCoverageCatalog = [
  {
    kind: 'ShadedMaterial',
    registrations: [{ module: '@flighthq/scene3d-wgpu', registrar: 'registerWgpuShadedMaterial' }],
    registry: RenderRegistry.MaterialRenderer,
  },
  {
    kind: 'image',
    registrations: [{ module: '@flighthq/scene3d-wgpu', registrar: 'registerWgpuImageTextureResolver' }],
    registry: RenderRegistry.TextureResolver,
  },
  {
    kind: 'RimModifier',
    registrations: [{ module: '@flighthq/scene3d-wgpu', registrar: 'registerWgpuRimModifier' }],
    registry: RenderRegistry.ModifierSnippet,
  },
];

function shadedUsage(withModifier = false): Scene3DKindUsage {
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

function entries(state: WgpuRenderState, withModifier = false): SceneCoverageEntry[] {
  const out: SceneCoverageEntry[] = [];
  explainWgpuScene3DCoverage(out, state, shadedUsage(withModifier), coverageCatalog);
  return out;
}

const renderer = { bind() {}, draw() {} } as never;

describe('explainWgpuScene3DCoverage', () => {
  it('reports a bare state with remedies for both unregistered requirements', () => {
    const found = entries(makeWgpuScene3DState().state);
    expect(found).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      module: '@flighthq/scene3d-wgpu',
      registrar: 'registerWgpuShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
    expect(found).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneTextureSourceKind,
      kind: 'image',
      module: '@flighthq/scene3d-wgpu',
      registrar: 'registerWgpuImageTextureResolver',
      registry: RenderRegistry.TextureResolver,
    });
  });

  it('downgrades the material gap to Fallback once a standard renderer can absorb it', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(entries(state)).toContainEqual({
      coverage: SceneCoverage.FallbackRemediable,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      module: '@flighthq/scene3d-wgpu',
      registrar: 'registerWgpuShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('reports the material as Satisfied once its own renderer is registered', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, 'ShadedMaterial', renderer);
    expect(entries(state)).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      facet: RequirementFacet.SceneMaterialKind,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('reports an unregistered modifier snippet as actionable, never a fallback', () => {
    // The shaded compiler assembles base + modifiers into one program, so an absent snippet fails the
    // whole material rather than degrading it.
    expect(entries(makeWgpuScene3DState().state, true)).toContainEqual({
      coverage: SceneCoverage.Unregistered,
      facet: RequirementFacet.SceneModifierKind,
      kind: 'RimModifier',
      module: '@flighthq/scene3d-wgpu',
      registrar: 'registerWgpuRimModifier',
      registry: RenderRegistry.ModifierSnippet,
    });
  });

  it('never reports a node-kind entry, since 3D collects meshes structurally', () => {
    expect(entries(makeWgpuScene3DState().state).some((e) => e.registry === RenderRegistry.NodeRenderer)).toBe(false);
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const { state } = makeWgpuScene3DState();
    const usage = shadedUsage();
    const out: SceneCoverageEntry[] = [];
    explainWgpuScene3DCoverage(out, state, usage, coverageCatalog);
    const first = out.length;
    explainWgpuScene3DCoverage(out, state, usage, coverageCatalog);
    expect(out).toHaveLength(first);
  });
});

describe('hasWgpuScene3DCoverage', () => {
  it('is false for a bare state and stays false while any kind is unserved', () => {
    expect(hasWgpuScene3DCoverage(makeWgpuScene3DState().state, shadedUsage())).toBe(false);
  });

  it('counts a standard-material fallback as uncovered, since the authored material would not appear', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(hasWgpuScene3DCoverage(state, shadedUsage())).toBe(false);
  });

  it('agrees with the explain tier on the same state, so the two can never disagree', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, 'ShadedMaterial', renderer);
    const usage = shadedUsage();
    const out: SceneCoverageEntry[] = [];
    explainWgpuScene3DCoverage(out, state, usage, coverageCatalog);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasWgpuScene3DCoverage(state, usage)).toBe(gaps.length === 0);
  });

  it('is true once nothing in the usage is unserved', () => {
    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, createScene3D());
    expect(hasWgpuScene3DCoverage(makeWgpuScene3DState().state, usage)).toBe(true);
  });
});
