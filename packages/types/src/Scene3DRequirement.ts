// The registries a Scene3D's content needs a binding in. Numeric identifiers for the same reason
// RenderRegistry uses them: the enum keeps human-readable remedy text out of the query, so
// `getScene3DRequirements` stays a plain-data walk and only the separately importable
// `formatScene3DRequirement` carries words. Values are assigned by declaration order and nothing
// persists them, so members stay alphabetized and callers name the member rather than its number.
//
// Overlaps RenderRegistry without reusing it: a document also needs bindings that live outside a
// RenderState (an image decoder, a material texture lister, a backend-neutral modifier registry), and
// it does NOT need the members RenderRegistry carries for the 2D path. NodeRenderer in particular is
// absent on purpose — the 3D pipeline collects meshes structurally (`mesh.geometry != null` in
// collectVisibleMeshes), so no node kind is registered against anything and reporting one would send a
// caller looking for a registrar that does not exist.
export enum Scene3DRegistry {
  ImageDecoder,
  MaterialRenderer,
  MaterialTextureLister,
  ModifierSnippet,
  ShadingModifier,
  TextureResolver,
}

// One binding a document's content requires. `key` is what the binding registers against, and its
// vocabulary is per-registry: a material kind for MaterialRenderer and MaterialTextureLister, a
// modifier kind for ModifierSnippet and ShadingModifier, a TextureSourceKind for TextureResolver, and
// a MIME type (`image/png`) for ImageDecoder. Typed as a plain string rather than Kind because the
// ImageDecoder member is not keyed by a kind at all.
export interface Scene3DRequirement {
  readonly key: string;
  readonly registry: Scene3DRegistry;
}
