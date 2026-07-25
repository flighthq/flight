import { forEachNodeDescendant } from '@flighthq/node';
import { isMesh } from '@flighthq/scene3d';
import type { Material, Scene3DMaterialTextureRegistry, Node3D, Texture } from '@flighthq/types';

import { getScene3DMaterialTextures } from './sceneMaterialTextureRegistry';

// Clears `out`, then fills it with the unique Textures reachable through `scene` whose `resource` is
// non-null. Walks the root node and every descendant; for each
// Mesh node it enumerates each non-null material's texture slots through the registry. Shared
// Textures (a parser memoizes one Texture object across meshes) are deduped by identity, so a
// resolver requests each pending image at most once.
export function getScene3DResourceTextures(
  scene: Readonly<Node3D>,
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  out: Texture[],
): void {
  out.length = 0;
  const seen = new Set<Texture>();
  const slots: Texture[] = [];
  collectNodeResourceTextures(scene, registry, out, seen, slots);
  // forEachNodeDescendant yields Node<Node3DTraits>; the intersection Node3D is re-narrowed by
  // isMesh inside the collector, so the cast only restores the trait fields the walk generic drops.
  forEachNodeDescendant(scene, (node) =>
    collectNodeResourceTextures(node as Readonly<Node3D>, registry, out, seen, slots),
  );
}

function collectNodeResourceTextures(
  node: Readonly<Node3D>,
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  out: Texture[],
  seen: Set<Texture>,
  slots: Texture[],
): void {
  if (!isMesh(node)) return;
  const materials = node.materials;
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i] as Material | null;
    if (material === null) continue;
    slots.length = 0;
    getScene3DMaterialTextures(registry, material, slots);
    for (let j = 0; j < slots.length; j++) {
      const texture = slots[j];
      if (texture.resource == null || seen.has(texture)) continue;
      seen.add(texture);
      out.push(texture);
    }
  }
}
