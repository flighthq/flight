import { findNode, forEachNodeDescendant } from '@flighthq/node';
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

// Collects every distinct material used in the scene subtree rooted at `root` (depth-first,
// `root` included) into `out`, scanning each mesh node's `materials` array and skipping nulls and
// by-reference duplicates (a material shared across meshes appears once). Appends to `out` without
// clearing it. The bulk sibling of findSceneMaterialByName: the enumeration a caller walks after
// import to inspect or re-derive the materials a format produced (pair with getMaterialOfKind to
// read a specific kind's fields). Order is the depth-first visitation order of first appearance.
export function getSceneMaterials(root: Readonly<SceneNode>, out: Material[]): void {
  collectNodeMaterials(root, out);
  forEachNodeDescendant(root, (node) => collectNodeMaterials(node as Readonly<SceneNode>, out));
}

// Appends `node`'s own not-yet-collected materials to `out`. Only mesh-like nodes (drawable leaves)
// carry `materials`; a bare group node reads through as absent.
function collectNodeMaterials(node: Readonly<SceneNode>, out: Material[]): void {
  const materials = (node as Readonly<Partial<Mesh>>).materials;
  if (materials == null) return;
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    if (material !== null && !out.includes(material)) out.push(material);
  }
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
