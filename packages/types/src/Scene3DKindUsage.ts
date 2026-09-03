import type { Entity, Kind } from './Entity';
import type { TextureSourceKind } from './TextureSourceKind';

// What a Scene3D actually uses, as plain kinds — the inventory half of "will this document draw?".
// Produced by a walk over the scene (getScene3DKindUsage) and consumed by whoever holds a registry:
// a backend answers whether it has a renderer for these material kinds, the resource layer whether it
// has a lister and a decoder. That split is the point. A scene knows WHAT is in it; only the holder of
// a registry knows whether anything is bound, and only the package that owns a registrar knows what it
// is called. Putting either of those here would make the scene layer carry render and resource
// vocabulary it has no business knowing, and would go stale the moment a registry moved.
//
// Every field is a deduplicated, sorted list, so two walks over the same scene compare equal and a
// caller can binary-search or diff them.
//
// `nodeKinds` is reported even though the 3D pipeline collects meshes structurally (`geometry != null`)
// rather than by registered kind. Whether a node kind needs a renderer is a render-layer fact; the
// scene reports what it contains and lets the consumer apply its own rule.
export interface Scene3DKindUsage extends Entity {
  materialKinds: Kind[];
  // Modifier kinds found on any material carrying a `modifiers` stack.
  modifierKinds: Kind[];
  nodeKinds: Kind[];
  // MIME types declared by the document's image resources (`image/png`). A resource whose type the
  // container did not declare contributes nothing — the resolver infers it at fetch time, so there is
  // no decoder to name in advance.
  resourceMimeTypes: string[];
  // Source kinds the scene's textures will sample from. A resource-backed texture contributes
  // ImageTextureSourceKind because resource resolution decodes to an Image, whatever the encoded type.
  textureSourceKinds: TextureSourceKind[];
}
