import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D, createScene3DKindUsage, getScene3DKindUsage } from '@flighthq/scene3d/contract';
import { createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  ImageResourceReference,
  Scene3DKindUsage,
  SceneCoverageEntry,
  WgpuRenderState,
} from '@flighthq/types/contract';
import {
  ImageResourceReferenceKind,
  RenderRegistry,
  ResourceResolutionState,
  SceneCoverage,
  StandardMaterialKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainWgpuScene3DCoverage, hasWgpuScene3DCoverage } from './explainWgpuScene3DCoverage';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

function shadedUsage(withModifier = false): Scene3DKindUsage {
  const ref: ImageResourceReference = {
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
  explainWgpuScene3DCoverage(out, state, shadedUsage(withModifier));
  return out;
}

const renderer = { bind() {}, draw() {} } as never;

describe('explainWgpuScene3DCoverage', () => {
  it('reports a bare state as missing both the material renderer and the texture resolver', () => {
    const found = entries(makeWgpuScene3DState().state);
    expect(found).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
    expect(found).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'image',
      registry: RenderRegistry.TextureResolver,
    });
  });

  it('downgrades the material gap to Fallback once a standard renderer can absorb it', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(entries(state)).toContainEqual({
      coverage: SceneCoverage.Fallback,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('reports the material as Satisfied once its own renderer is registered', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuMeshMaterialRenderer(state, 'ShadedMaterial', renderer);
    expect(entries(state)).toContainEqual({
      coverage: SceneCoverage.Satisfied,
      kind: 'ShadedMaterial',
      registry: RenderRegistry.MaterialRenderer,
    });
  });

  it('reports an unregistered modifier snippet as Missing, never a fallback', () => {
    // The shaded compiler assembles base + modifiers into one program, so an absent snippet fails the
    // whole material rather than degrading it.
    expect(entries(makeWgpuScene3DState().state, true)).toContainEqual({
      coverage: SceneCoverage.Missing,
      kind: 'RimModifier',
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
    explainWgpuScene3DCoverage(out, state, usage);
    const first = out.length;
    explainWgpuScene3DCoverage(out, state, usage);
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
    explainWgpuScene3DCoverage(out, state, usage);
    const gaps = out.filter((e) => e.coverage !== SceneCoverage.Satisfied);
    expect(hasWgpuScene3DCoverage(state, usage)).toBe(gaps.length === 0);
  });

  it('is true once nothing in the usage is unserved', () => {
    const usage = createScene3DKindUsage();
    getScene3DKindUsage(usage, createScene3D());
    expect(hasWgpuScene3DCoverage(makeWgpuScene3DState().state, usage)).toBe(true);
  });
});
