import {
  addNodeChild,
  getNodeChildren,
  getNodeLocalMatrix4,
  isNodeLocalMatrix4Detached,
  setNodeLocalMatrix4,
  setNodeTransform3D,
} from '@flighthq/node/contract';
import type { Material, Node3D } from '@flighthq/types/contract';

import { cloneMesh, isMesh } from './mesh';
import { createNode3D } from './sceneNode';

export function cloneNode3DSubtree(
  source: Readonly<Node3D>,
  materialOverride: ((material: Material | null) => Material | null) | null = null,
): Node3D {
  const clone = cloneNode3DShallow(source, materialOverride);
  for (const child of getNodeChildren(source)) {
    addNodeChild(clone, cloneNode3DSubtree(child, materialOverride));
  }
  return clone;
}

function cloneNode3DShallow(
  source: Readonly<Node3D>,
  materialOverride: ((material: Material | null) => Material | null) | null,
): Node3D {
  if (isMesh(source)) {
    const clone = cloneMesh(source);
    if (materialOverride !== null) {
      clone.materials = clone.materials.map(materialOverride);
    }
    return clone;
  }
  const clone = createNode3D(source.kind, {
    alpha: source.alpha,
    enabled: source.enabled,
    name: source.name,
    visible: source.visible,
  });
  setNodeTransform3D(clone, source);
  if (isNodeLocalMatrix4Detached(source)) {
    setNodeLocalMatrix4(clone, getNodeLocalMatrix4(source));
  }
  return clone;
}
