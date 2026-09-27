import { composeMatrix4FromTransform3D, createMatrix4, multiplyMatrix4 } from '@flighthq/geometry/contract';
import type { Matrix4Like, Scene3DDocument, Scene3DDocumentNode, XmlElement } from '@flighthq/types/contract';

import { colladaChild, colladaChildren } from './colladaXml.ts';

export function applyColladaBindMaterial(
  document: Scene3DDocument,
  meshIndex: number,
  instanceElement: XmlElement,
  primitiveSymbols: readonly string[] | undefined,
  materialIndices: ReadonlyMap<string, number>,
): number {
  const symbolToIndex = parseColladaBindMaterial(instanceElement, materialIndices);
  return applyColladaMaterialOverrides(document, meshIndex, primitiveSymbols, symbolToIndex);
}

export function applyColladaMaterialOverrides(
  document: Scene3DDocument,
  meshIndex: number,
  primitiveSymbols: readonly string[] | undefined,
  symbolToIndex: ReadonlyMap<string, number>,
): number {
  const resolved = resolveColladaPrimitiveSymbols(primitiveSymbols, symbolToIndex);
  if (resolved.length === 0) return meshIndex;
  const mesh = document.meshes[meshIndex];
  if (mesh.materials.length === 0) {
    mesh.materials = resolved;
    return meshIndex;
  }
  if (mesh.materials.length === resolved.length && mesh.materials.every((m, i) => m === resolved[i])) {
    return meshIndex;
  }
  const cloneIndex = document.meshes.length;
  document.meshes.push({ geometry: mesh.geometry, materials: resolved, name: mesh.name, skin: mesh.skin });
  return cloneIndex;
}

export function buildColladaNodeWorldMatrices(
  nodes: readonly Scene3DDocumentNode[],
  rootNodeIndices: readonly number[],
): (Matrix4Like | undefined)[] {
  const worldMatrices: (Matrix4Like | undefined)[] = new Array(nodes.length);
  const pending: { nodeIndex: number; parent: Matrix4Like | null }[] = [];
  for (let i = rootNodeIndices.length - 1; i >= 0; i--) pending.push({ nodeIndex: rootNodeIndices[i], parent: null });
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const node = nodes[entry.nodeIndex];
    if (node === undefined) continue;
    const local = createMatrix4();
    const world = createMatrix4();
    composeMatrix4FromTransform3D(local, node.transform);
    if (entry.parent === null) world.m.set(local.m);
    else multiplyMatrix4(world, entry.parent, local);
    worldMatrices[entry.nodeIndex] = world;
    for (let i = node.children.length - 1; i >= 0; i--) {
      pending.push({ nodeIndex: node.children[i], parent: world });
    }
  }
  return worldMatrices;
}

export function parseColladaBindMaterial(
  instanceElement: XmlElement,
  materialIndices: ReadonlyMap<string, number>,
): Map<string, number> {
  const symbolToIndex = new Map<string, number>();
  const bindMaterial = colladaChild(instanceElement, 'bind_material');
  if (!bindMaterial) return symbolToIndex;
  const technique = colladaChild(bindMaterial, 'technique_common');
  if (!technique) return symbolToIndex;
  for (const inst of colladaChildren(technique, 'instance_material')) {
    const symbol = inst.attributes.symbol;
    const target = inst.attributes.target?.replace(/^#/, '');
    if (symbol && target) {
      const materialIndex = materialIndices.get(target);
      if (materialIndex !== undefined) symbolToIndex.set(symbol, materialIndex);
    }
  }
  return symbolToIndex;
}

export function resolveColladaPrimitiveSymbols(
  symbols: readonly string[] | undefined,
  symbolToIndex: ReadonlyMap<string, number>,
): number[] {
  if (!symbols || symbolToIndex.size === 0) return [];
  const resolved: number[] = [];
  for (const sym of symbols) {
    const idx = symbolToIndex.get(sym);
    if (idx !== undefined) resolved.push(idx);
  }
  return resolved;
}
