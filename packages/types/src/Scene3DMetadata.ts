// Plain-data provenance for an imported Scene3D: the fields a model file carries about itself rather than about
// its geometry. Populated by the `createScene3DFrom*` importers from the source file's asset block (glTF
// `asset`, etc.); `null` fields when the format does not supply them.
export interface Scene3DMetadata {
  copyright: string | null;
  generator: string | null;
  version: string | null;
}
