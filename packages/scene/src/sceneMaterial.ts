import { findNode } from '@flighthq/node';
import type { Material, Mesh, SceneNode } from '@flighthq/types';

// Finds the first material named `name` in the scene subtree rooted at `root` (depth-first
// pre-order, `root` included), scanning each mesh node's `materials` array. Returns `null` when no
// material carries that name. The 3D importers preserve each format's authored material identity
// (an MTL `newmtl`, a glTF `material.name`, a 3DS material chunk, an MD2/MD5 skin path) on
// `Material.name`, so a caller can address an imported material by its artist-given handle — for
// example to tweak transparency — instead of matching on observable traits. The material sibling
// of node's findNodeByName.
export function findSceneMaterialByName(root: Readonly<SceneNode>, name: string): Material | null {
  const rootMatch = getNamedNodeMaterial(root, name);
  if (rootMatch !== null) return rootMatch;
  let found: Material | null = null;
  findNode(root, (node) => {
    const match = getNamedNodeMaterial(node as Readonly<SceneNode>, name);
    if (match === null) return false;
    found = match;
    return true;
  });
  return found;
}

// Returns the first material named `name` on `node`'s own `materials` array, or `null`. Only
// mesh-like nodes (drawable leaves) carry `materials`; a bare group node reads through as absent.
function getNamedNodeMaterial(node: Readonly<SceneNode>, name: string): Material | null {
  const materials = (node as Readonly<Partial<Mesh>>).materials;
  if (materials == null) return null;
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    if (material !== null && material.name === name) return material;
  }
  return null;
}
