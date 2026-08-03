import type { ImageResourceReference, Scene3D, Texture } from '@flighthq/types/contract';

// Clears `out`, then fills it with the unique Textures reachable through `scene` whose `resource` is
// non-null. Shared Textures (a parser memoizes one Texture object across meshes) are deduped by
// identity, so a resolver requests each pending image at most once.
//
// A document's resources already name their consuming textures — a parser binds the back-edge when it
// constructs the Texture — so that set alone is the complete answer, and no material registry is
// consulted to produce it. This used to walk the graph through a per-kind lister registry to NARROW the
// set, dropping textures whose material hung off no mesh; that narrowing was an optimization that
// silently disabled itself for any material kind the registry could not describe (including every
// custom one), and it made discovery depend on a registration the caller had no way to know it needed.
//
// Set iteration is insertion order, which is resource order then per-resource texture order — stable
// across runs, so a caller's request order does not drift.
export function getScene3DResourceTextures(out: Texture[], scene: Readonly<Scene3D>): void {
  out.length = 0;
  const seen = new Set<Texture>();
  for (const resource of scene.resources) {
    for (const texture of resource.textures ?? []) {
      if (seen.has(texture)) continue;
      seen.add(texture);
      out.push(texture);
    }
  }
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
