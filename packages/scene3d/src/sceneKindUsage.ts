import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { forEachNodeDescendant } from '@flighthq/node/contract';
import type {
  EntityConstruction,
  Material,
  Modifier,
  Node3D,
  Scene3D,
  Scene3DKindUsage,
} from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { isMesh } from './mesh';

export function createScene3DKindUsage(): Scene3DKindUsage {
  const out = allocateEntity<Scene3DKindUsage>();
  initializeScene3DKindUsage(out);
  return finishEntity(out);
}

// Clears `out`, then fills it with every kind this scene uses. One walk, no registry, no backend, no
// prose — it reads `kind` off the entities the parser already built, so it cannot itself be the thing
// you forgot to wire.
//
// This answers only WHAT IS IN THE SCENE. Whether anything is registered to draw or resolve those kinds
// is a question for the package that owns the registry — a backend checks its own material and texture
// registries, the resource layer its listers and decoders. Keeping those answers out of here is what
// lets a scene stay ignorant of rendering, and what stops this walk from going stale when a registry
// moves or a registrar is renamed.
export function getScene3DKindUsage(out: Scene3DKindUsage, scene: Readonly<Scene3D>): void {
  out.materialKinds.length = 0;
  out.modifierKinds.length = 0;
  out.nodeKinds.length = 0;
  out.resourceMimeTypes.length = 0;
  out.textureSourceKinds.length = 0;

  const visit = (node: Readonly<Node3D>): void => {
    addScene3DUsedKind(out.nodeKinds, node.kind);
    if (!isMesh(node)) return;
    const materials = node.materials;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i] as Material | null;
      if (material === null) continue;
      addScene3DUsedKind(out.materialKinds, material.kind);
      // Structural, like isMesh: any material family carrying a `modifiers` stack is walked, including
      // a custom kind, without a per-kind table that would drift as families are added.
      const modifiers = (material as Readonly<Partial<{ modifiers: readonly Modifier[] }>>).modifiers;
      if (modifiers === undefined) continue;
      for (let m = 0; m < modifiers.length; m++) addScene3DUsedKind(out.modifierKinds, modifiers[m].kind);
    }
  };
  visit(scene.root);
  // forEachNodeDescendant yields Node<Node3DTraits>; isMesh re-narrows inside the visitor, so the cast
  // only restores the trait fields the walk generic drops.
  forEachNodeDescendant(scene.root, (node) => visit(node as Readonly<Node3D>));

  for (let i = 0; i < scene.resources.length; i++) {
    const resource = scene.resources[i];
    // A resource nothing consumes is inert sidecar data (a glTF image no material sampled): it is
    // never fetched, so nothing about it is used.
    if (resource.textures === undefined || resource.textures.length === 0) continue;
    addScene3DUsedKind(out.textureSourceKinds, ImageTextureSourceKind);
    if (resource.mimeType !== null) addScene3DUsedKind(out.resourceMimeTypes, resource.mimeType);
  }

  out.materialKinds.sort();
  out.modifierKinds.sort();
  out.nodeKinds.sort();
  out.resourceMimeTypes.sort();
  out.textureSourceKinds.sort();
}

// Allocates an empty usage record. Separate from the walk so a caller can reuse one across scenes or
// frames without reallocating five arrays.
export function initializeScene3DKindUsage(out: EntityConstruction<Scene3DKindUsage>): void {
  out.materialKinds = [];
  out.modifierKinds = [];
  out.nodeKinds = [];
  out.resourceMimeTypes = [];
  out.textureSourceKinds = [];
}

// Linear scan rather than a Set: these lists are the handful of distinct kinds a document uses, where
// scanning beats allocating five Sets per walk, and it keeps the result a plain array a C port can hold
// without a hash container.
function addScene3DUsedKind(kinds: string[], kind: string): void {
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === kind) return;
  }
  kinds.push(kind);
}
