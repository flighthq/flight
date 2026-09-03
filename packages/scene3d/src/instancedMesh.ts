import { copyMatrix4, createMatrix4 } from '@flighthq/geometry/contract';
import type { InstancedMesh, Kind, Material, Matrix4, MeshGeometry } from '@flighthq/types/contract';
import { InstancedMeshKind } from '@flighthq/types/contract';

export { InstancedMeshKind };

import { createNode3D } from './sceneNode';

const DEFAULT_CAPACITY = 16;

export function createInstancedMesh(
  geometry: MeshGeometry,
  materials: (Material | null)[],
  capacity?: number,
  kind: Kind = InstancedMeshKind,
): InstancedMesh {
  const cap = capacity ?? DEFAULT_CAPACITY;
  const matrices: Matrix4[] = new Array(cap);
  for (let i = 0; i < cap; i++) matrices[i] = createMatrix4();
  const node = createNode3D(kind) as InstancedMesh;
  node.geometry = geometry;
  node.instanceColors = null;
  node.instanceCount = 0;
  node.instanceMatrices = matrices;
  node.materials = materials;
  node.version = 0;
  return node;
}

export function getInstancedMeshInstanceColor(source: Readonly<InstancedMesh>, index: number): number {
  if (source.instanceColors === null || index >= source.instanceCount) return 0xffffffff;
  return source.instanceColors[index];
}

export function getInstancedMeshInstanceMatrix(out: Matrix4, source: Readonly<InstancedMesh>, index: number): Matrix4 {
  if (index < source.instanceCount) copyMatrix4(out, source.instanceMatrices[index]);
  return out;
}

export function invalidateInstancedMesh(target: InstancedMesh): void {
  target.version++;
}

export function isInstancedMesh(source: unknown): source is InstancedMesh {
  return (
    source != null &&
    typeof source === 'object' &&
    (source as Partial<InstancedMesh>).instanceMatrices != null &&
    (source as Partial<InstancedMesh>).geometry != null
  );
}

export function setInstancedMeshInstanceColor(target: InstancedMesh, index: number, color: number): void {
  if (index >= target.instanceCount) return;
  if (target.instanceColors === null) {
    target.instanceColors = new Uint32Array(target.instanceMatrices.length);
    target.instanceColors.fill(0xffffffff);
  }
  target.instanceColors[index] = color;
  invalidateInstancedMesh(target);
}

export function setInstancedMeshInstanceCount(target: InstancedMesh, count: number): void {
  ensureInstancedMeshCapacity(target, count);
  target.instanceCount = count;
  invalidateInstancedMesh(target);
}

export function setInstancedMeshInstanceMatrix(target: InstancedMesh, index: number, matrix: Readonly<Matrix4>): void {
  if (index >= target.instanceCount) return;
  copyMatrix4(target.instanceMatrices[index], matrix);
  invalidateInstancedMesh(target);
}

function ensureInstancedMeshCapacity(target: InstancedMesh, capacity: number): void {
  const matrices = target.instanceMatrices;
  if (matrices.length >= capacity) return;
  const newCap = Math.max(capacity, matrices.length * 2);
  for (let i = matrices.length; i < newCap; i++) matrices.push(createMatrix4());
  if (target.instanceColors !== null) {
    const newColors = new Uint32Array(newCap);
    newColors.set(target.instanceColors);
    newColors.fill(0xffffffff, target.instanceColors.length);
    target.instanceColors = newColors;
  }
}
