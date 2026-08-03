import { createBlinnPhongMaterial, createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D, createScene3DKindUsage, getScene3DKindUsage } from '@flighthq/scene3d/contract';
import { createShadedMaterial } from '@flighthq/shading/contract';
import type { Material, SceneCoverageEntry, Scene3DKindUsage } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainScene3DResourceCoverage, hasScene3DResourceCoverage } from './explainScene3DResourceCoverage';
import { createBuiltInScene3DResourceResolver, createScene3DResourceResolver } from './sceneResourceResolver';
import { registerShadedScene3DMaterialTextures } from './shadedScene3DMaterialTextures';

function usageOf(...materials: Material[]): Scene3DKindUsage {
  const scene = createScene3D();
  for (const material of materials) {
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [material]));
  }
  const usage = createScene3DKindUsage();
  getScene3DKindUsage(usage, scene);
  return usage;
}

function gaps(resolver: Parameters<typeof explainScene3DResourceCoverage>[1], usage: Scene3DKindUsage) {
  const out: SceneCoverageEntry[] = [];
  explainScene3DResourceCoverage(out, resolver, usage);
  return out;
}

describe('explainScene3DResourceCoverage', () => {
  it('reports a bare resolver as missing every material kind, since its registry starts empty', () => {
    const found = gaps(createScene3DResourceResolver(), usageOf(createUnlitMaterial()));
    expect(found).toEqual([
      { coverage: SceneCoverage.Missing, kind: 'UnlitMaterial', registry: RenderRegistry.MaterialTextureLister },
    ]);
  });

  it('reports a covered kind as Satisfied rather than omitting it', () => {
    // The manifest lists every requirement, so a caller can render a checklist and tell "covered" from
    // "never asked about". Omitting covered kinds would make those two indistinguishable.
    expect(gaps(createBuiltInScene3DResourceResolver(), usageOf(createUnlitMaterial()))).toEqual([
      { coverage: SceneCoverage.Satisfied, kind: 'UnlitMaterial', registry: RenderRegistry.MaterialTextureLister },
    ]);
  });

  it('reports ShadedMaterial against the built-in assembly, which does not wire its lister', () => {
    // The gap this query exists to surface: shading ships registerShadedScene3DMaterialTextures, but
    // createBuiltInScene3DResourceResolver covers only the surface-PBR families, so an AWD2 document
    // loaded through the built-in assembly has no lister for its materials.
    expect(gaps(createBuiltInScene3DResourceResolver(), usageOf(createShadedMaterial()))).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialTextureLister,
    });
  });

  it('stops reporting once the named door for that family is called', () => {
    const resolver = createBuiltInScene3DResourceResolver();
    registerShadedScene3DMaterialTextures(resolver.registry);
    expect(gaps(resolver, usageOf(createShadedMaterial()))).toEqual([
      { coverage: SceneCoverage.Satisfied, kind: 'ShadedMaterial', registry: RenderRegistry.MaterialTextureLister },
    ]);
  });

  it('reports a family that ships no lister at all, so the omission is visible rather than inferred', () => {
    // BlinnPhongMaterial carries four texture slots and has no lister anywhere in the SDK.
    expect(gaps(createBuiltInScene3DResourceResolver(), usageOf(createBlinnPhongMaterial()))).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'BlinnPhongMaterial',
      registry: RenderRegistry.MaterialTextureLister,
    });
  });

  it('clears out, so a repeated call does not accumulate', () => {
    const resolver = createScene3DResourceResolver();
    const usage = usageOf(createUnlitMaterial());
    const out: SceneCoverageEntry[] = [];
    explainScene3DResourceCoverage(out, resolver, usage);
    const first = out.length;
    explainScene3DResourceCoverage(out, resolver, usage);
    expect(out).toHaveLength(first);
  });
});

describe('hasScene3DResourceCoverage', () => {
  it('is false while any material kind is undescribed', () => {
    expect(hasScene3DResourceCoverage(createScene3DResourceResolver(), usageOf(createUnlitMaterial()))).toBe(false);
  });

  it('agrees with the explain tier on the same resolver, so the two can never disagree', () => {
    const resolver = createBuiltInScene3DResourceResolver();
    const usage = usageOf(createUnlitMaterial(), createShadedMaterial());
    const out: SceneCoverageEntry[] = [];
    explainScene3DResourceCoverage(out, resolver, usage);
    expect(hasScene3DResourceCoverage(resolver, usage)).toBe(out.length === 0);
  });

  it('stays true when the manifest is all Satisfied entries, which are not shortfalls', () => {
    // The invariant the manifest widening could have broken: explain now appends entries for covered
    // kinds too, and the predicate must keep counting only real gaps.
    const resolver = createBuiltInScene3DResourceResolver();
    const usage = usageOf(createUnlitMaterial());
    const out: SceneCoverageEntry[] = [];
    explainScene3DResourceCoverage(out, resolver, usage);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.coverage === SceneCoverage.Satisfied)).toBe(true);
    expect(hasScene3DResourceCoverage(resolver, usage)).toBe(true);
  });

  it('is true for an empty scene, which names no material kinds', () => {
    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, createScene3D());
    expect(hasScene3DResourceCoverage(createScene3DResourceResolver(), usage)).toBe(true);
  });
});
