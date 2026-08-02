// The decoded result of one KHR_draco_mesh_compression payload: one flat array per attribute SEMANTIC
// (POSITION, NORMAL, TEXCOORD_0, …), plus the triangle indices the payload also carries.
//
// Attributes come back keyed by semantic rather than by Draco attribute id because the id→semantic
// mapping is stated by the glTF extension block, which is Flight's side of the boundary. A decoder is
// handed the mapping and is not asked to reinvent it.
//
// Component counts are NOT carried here: the primitive's own accessors still declare each attribute's
// type and count under this extension, so the importer already knows how to stride the array and can
// check the decoder against what the file promised.
export interface GltfDracoMesh {
  attributes: Readonly<Record<string, Float32Array>>;
  indices: Uint32Array | null;
  vertexCount: number;
}

// Decodes one KHR_draco_mesh_compression payload, or returns null if it cannot.
//
// SYNCHRONOUS BY CONTRACT. `parseGltf` is synchronous, so a decoder that needs asynchronous setup — the
// usual case, since real Draco decoders initialise a WebAssembly module — performs that setup once at
// startup and registers only the ready decoder. Registration is what declares readiness; the importer
// never awaits.
//
// Flight ships no implementation of this. It is the seam a caller plugs its own decoder into, so that
// accepting Draco is a choice a consumer makes explicitly rather than a dependency every build carries.
export type GltfDracoDecoder = (
  bytes: Readonly<Uint8Array>,
  attributeIds: Readonly<Record<string, number>>,
) => GltfDracoMesh | null;
