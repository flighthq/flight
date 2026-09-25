import { createMaterial3D } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { withKindMapEntry } from '@flighthq/registry/contract';
import { createMesh, createNode3D } from '@flighthq/scene3d/contract';
import type { Kind, NodeRenderer } from '@flighthq/types/contract';
import { Node3DKind, StandardMaterialKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainScene3DPipelineCoverage } from './explainScene3DPipelineCoverage.ts';
import { registerNodeRenderer } from './renderer.ts';
import { createRenderState } from './renderState.ts';

const renderer: NodeRenderer = { createData: () => null, submit: () => {} } as unknown as NodeRenderer;

function box() {
  return createBoxMeshGeometry(1, 1, 1);
}

function materialTable(...kinds: string[]): ReadonlyMap<Kind, unknown> {
  let table: ReadonlyMap<string, unknown> = new Map();
  for (const kind of kinds) {
    table = withKindMapEntry(table, kind, {});
  }
  return table;
}

describe('explainScene3DPipelineCoverage', () => {
  it('reports StandardMaterial as used when a mesh has only null material slots', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Mesh', renderer);
    const matTable = materialTable(StandardMaterialKind);
    const root = createMesh(box(), [null]);
    const result = explainScene3DPipelineCoverage(state, root, matTable);
    expect(result.usedMaterialKinds).toEqual([StandardMaterialKind]);
    expect(result.registeredMaterialKinds).toEqual([StandardMaterialKind]);
    expect(result.uncoveredMaterialKinds).toEqual([]);
    expect(result.unusedMaterialRegistrations).toEqual([]);
  });

  it('reports uncovered material kinds when a custom material has no registered renderer', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Mesh', renderer);
    const matTable = materialTable(StandardMaterialKind);
    const customMat = createMaterial3D('PhongMaterial');
    const root = createMesh(box(), [customMat]);
    const result = explainScene3DPipelineCoverage(state, root, matTable);
    expect(result.usedMaterialKinds).toEqual(['PhongMaterial']);
    expect(result.uncoveredMaterialKinds).toEqual(['PhongMaterial']);
    expect(result.unusedMaterialRegistrations).toEqual([StandardMaterialKind]);
  });

  it('returns empty material dimension when materialRenderers is null', () => {
    const state = createRenderState();
    const root = createMesh(box(), [null]);
    const result = explainScene3DPipelineCoverage(state, root, null);
    expect(result.usedMaterialKinds).toEqual([StandardMaterialKind]);
    expect(result.registeredMaterialKinds).toEqual([]);
    expect(result.uncoveredMaterialKinds).toEqual([StandardMaterialKind]);
    expect(result.unusedMaterialRegistrations).toEqual([]);
  });

  it('reports unused node registrations for an empty scene', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Mesh', renderer);
    registerNodeRenderer(state, 'InstancedMesh', renderer);
    const matTable = materialTable(StandardMaterialKind);
    const root = createNode3D(Node3DKind);
    const result = explainScene3DPipelineCoverage(state, root, matTable);
    expect(result.usedKinds).toEqual([Node3DKind]);
    expect(result.uncoveredKinds).toEqual([Node3DKind]);
    expect(result.unusedRegistrations).toEqual(['InstancedMesh', 'Mesh']);
    expect(result.usedMaterialKinds).toEqual([]);
    expect(result.unusedMaterialRegistrations).toEqual([StandardMaterialKind]);
  });

  it('collects both node and material kinds across a mixed scene tree', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Mesh', renderer);
    registerNodeRenderer(state, Node3DKind, renderer);
    const matTable = materialTable(StandardMaterialKind, 'PhongMaterial');
    const root = createNode3D(Node3DKind);
    const child1 = createMesh(box(), [null]);
    const child2 = createMesh(box(), [createMaterial3D('PhongMaterial')]);
    addNodeChild(root, child1);
    addNodeChild(root, child2);
    const result = explainScene3DPipelineCoverage(state, root, matTable);
    expect(result.usedKinds).toEqual(['Mesh', Node3DKind]);
    expect(result.uncoveredKinds).toEqual([]);
    expect(result.unusedRegistrations).toEqual([]);
    expect(result.usedMaterialKinds).toEqual(['PhongMaterial', StandardMaterialKind]);
    expect(result.uncoveredMaterialKinds).toEqual([]);
    expect(result.unusedMaterialRegistrations).toEqual([]);
  });

  it('returns sorted, stable arrays for both dimensions', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Mesh', renderer);
    registerNodeRenderer(state, 'InstancedMesh', renderer);
    registerNodeRenderer(state, Node3DKind, renderer);
    const matTable = materialTable('ZebraMaterial', 'AlphaMaterial', StandardMaterialKind);
    const root = createNode3D(Node3DKind);
    const child = createMesh(box(), [createMaterial3D('ZebraMaterial'), null]);
    addNodeChild(root, child);
    const result = explainScene3DPipelineCoverage(state, root, matTable);
    expect(result.registeredKinds).toEqual(['InstancedMesh', 'Mesh', Node3DKind]);
    expect(result.registeredMaterialKinds).toEqual(['AlphaMaterial', StandardMaterialKind, 'ZebraMaterial']);
    expect(result.usedKinds).toEqual(['Mesh', Node3DKind]);
    expect(result.usedMaterialKinds).toEqual([StandardMaterialKind, 'ZebraMaterial']);
    expect(result.unusedRegistrations).toEqual(['InstancedMesh']);
    expect(result.unusedMaterialRegistrations).toEqual(['AlphaMaterial']);
  });
});
