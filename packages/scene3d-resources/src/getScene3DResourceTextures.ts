import { forEachNodeDescendant } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import type {
  ImageResourceReference,
  Material,
  Scene3D,
  Scene3DMaterialTextureRegistry,
  Node3D,
  Texture,
} from '@flighthq/types/contract';

import { getScene3DMaterialTextures, hasScene3DMaterialTextureLister } from './sceneMaterialTextureRegistry';

// Clears `out`, then fills it with the unique Textures reachable through `scene` whose `resource` is
// non-null. Shared Textures (a parser memoizes one Texture object across meshes) are deduped by
// identity, so a resolver requests each pending image at most once.
//
// The document's resources ALREADY name their consuming textures — a parser binds the back-edge when it
// constructs the Texture — so that set alone is a complete and registry-free answer. Walking the graph
// through the lister registry only NARROWS it, dropping textures whose material hangs off no mesh in
// this scene. That narrowing is an optimization, and it is only sound for material kinds the registry
// can actually describe.
//
// Hence the widening fallback: a material kind with no registered lister makes the walk abandon
// narrowing for the whole scene and fall back to every resource-backed texture. An unregistered lister
// therefore costs at most a texture fetched that a mesh-attached material did not need — never a
// texture silently left unresolved, which is what an unknown kind used to produce and which surfaced as
// a model rendering untextured with nothing reported. Coarse on purpose: once one material's slots are
// unknown, no per-texture verdict is trustworthy.
export function getScene3DResourceTextures(
  scene: Readonly<Scene3D>,
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  out: Texture[],
): void {
  out.length = 0;
  const referenced = new Set<Texture>();
  for (const resource of scene.resources) {
    for (const texture of resource.textures ?? []) referenced.add(texture);
  }
  const seen = new Set<Texture>();
  const slots: Texture[] = [];
  const unknown: UnknownMaterialKindFlag = { found: false };
  collectNodeResourceTextures(scene.root, registry, referenced, out, seen, slots, unknown);
  // forEachNodeDescendant yields Node<Node3DTraits>; the intersection Node3D is re-narrowed by
  // isMesh inside the collector, so the cast only restores the trait fields the walk generic drops.
  forEachNodeDescendant(scene.root, (node) =>
    collectNodeResourceTextures(node as Readonly<Node3D>, registry, referenced, out, seen, slots, unknown),
  );
  if (!unknown.found) return;
  // Set iteration is insertion order, which is resource order then per-resource texture order — stable
  // across runs, so a caller's request order does not drift with the walk.
  out.length = 0;
  for (const texture of referenced) out.push(texture);
}

export function getScene3DTextureResourceReference(
  scene: Readonly<Scene3D>,
  texture: Readonly<Texture>,
): ImageResourceReference | null {
  for (const resource of scene.resources) {
    if (resource.textures?.includes(texture as Texture) === true) return resource;
  }
  return null;
}

interface UnknownMaterialKindFlag {
  found: boolean;
}

function collectNodeResourceTextures(
  node: Readonly<Node3D>,
  registry: Readonly<Scene3DMaterialTextureRegistry>,
  referenced: ReadonlySet<Texture>,
  out: Texture[],
  seen: Set<Texture>,
  slots: Texture[],
  unknown: UnknownMaterialKindFlag,
): void {
  if (!isMesh(node)) return;
  const materials = node.materials;
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i] as Material | null;
    if (material === null) continue;
    if (!hasScene3DMaterialTextureLister(registry, material.kind)) {
      unknown.found = true;
      continue;
    }
    slots.length = 0;
    getScene3DMaterialTextures(registry, material, slots);
    for (let j = 0; j < slots.length; j++) {
      const texture = slots[j];
      if (!referenced.has(texture) || seen.has(texture)) continue;
      seen.add(texture);
      out.push(texture);
    }
  }
}
