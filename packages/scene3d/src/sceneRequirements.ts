import { forEachNodeDescendant } from '@flighthq/node/contract';
import type { Material, Modifier, Node3D, Scene3D, Scene3DRequirement } from '@flighthq/types/contract';
import { ImageTextureSourceKind, Scene3DRegistry } from '@flighthq/types/contract';

import { isMesh } from './mesh';

// Clears `out`, then fills it with every registration this document's content requires — the shopping
// list a caller reads once after import and transcribes into its own explicit `register*` calls.
// Deduped, and ordered by (registry, key) so two runs over the same scene compare equal.
//
// Takes no registry, which is the point: it reads `kind` off the entities the parser already built, so
// the query can never itself be the thing you forgot to wire. There is deliberately NO register-all
// counterpart — the list exists so a caller registers exactly what its content needs and everything
// else stays shaken out of the bundle. Answering "what is missing" by widening a barrel would trade the
// bundle invariant for the convenience this query already provides.
//
// Reports what the CONTENT needs, not what a given caller must do about it: a material texture lister
// only matters to a caller that resolves image resources, and a modifier snippet only to one that
// draws. `formatScene3DRequirement` carries that per-registry qualification in words.
//
// NodeRenderer is absent by design — the 3D pipeline collects meshes structurally rather than by
// registered node kind, so there is no such registrar to name (see Scene3DRegistry).
export function getScene3DRequirements(scene: Readonly<Scene3D>, out: Scene3DRequirement[]): void {
  out.length = 0;
  const seen = new Set<string>();
  const visit = (node: Readonly<Node3D>): void => {
    if (!isMesh(node)) return;
    const materials = node.materials;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i] as Material | null;
      if (material === null) continue;
      addScene3DRequirement(out, seen, Scene3DRegistry.MaterialRenderer, material.kind);
      if (scene.resources.length !== 0) {
        addScene3DRequirement(out, seen, Scene3DRegistry.MaterialTextureLister, material.kind);
      }
      // Structural, like isMesh: any material family carrying a `modifiers` stack is walked, including
      // a custom kind, without a per-kind table that would drift as families are added.
      const modifiers = (material as Readonly<Partial<{ modifiers: readonly Modifier[] }>>).modifiers;
      if (modifiers === undefined) continue;
      for (let m = 0; m < modifiers.length; m++) {
        addScene3DRequirement(out, seen, Scene3DRegistry.ModifierSnippet, modifiers[m].kind);
        addScene3DRequirement(out, seen, Scene3DRegistry.ShadingModifier, modifiers[m].kind);
      }
    }
  };
  visit(scene.root);
  // forEachNodeDescendant yields Node<Node3DTraits>; isMesh re-narrows inside the visitor, so the cast
  // only restores the trait fields the walk generic drops.
  forEachNodeDescendant(scene.root, (node) => visit(node as Readonly<Node3D>));

  for (let i = 0; i < scene.resources.length; i++) {
    const resource = scene.resources[i];
    // A resource nothing consumes is inert sidecar data (a glTF image no material sampled): it is
    // never fetched, so it requires nothing.
    if (resource.textures === undefined || resource.textures.length === 0) continue;
    // The bound source is always an Image — resource resolution decodes to one — so the resolver a
    // caller must register is the one for ImageTextureSourceKind, whatever the encoded MIME type was.
    addScene3DRequirement(out, seen, Scene3DRegistry.TextureResolver, ImageTextureSourceKind);
    // Null when the container did not declare a type and the bytes were not sniffed; the resolver
    // infers it at fetch time, so there is no decoder this query can name.
    if (resource.mimeType !== null) {
      addScene3DRequirement(out, seen, Scene3DRegistry.ImageDecoder, resource.mimeType);
    }
  }
  out.sort(compareScene3DRequirements);
}

function addScene3DRequirement(
  out: Scene3DRequirement[],
  seen: Set<string>,
  registry: Scene3DRegistry,
  key: string,
): void {
  // NUL separates the two parts so no registry/key pair can collide with another by concatenation.
  const identity = `${registry}\u0000${key}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  out.push({ key, registry });
}

function compareScene3DRequirements(a: Readonly<Scene3DRequirement>, b: Readonly<Scene3DRequirement>): number {
  if (a.registry !== b.registry) return a.registry - b.registry;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
