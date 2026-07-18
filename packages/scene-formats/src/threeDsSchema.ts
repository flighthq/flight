// Autodesk 3DS binary chunked format — chunk ID constants and descriptor interfaces for the subset
// @flighthq/scene-formats imports. The 3DS format is a recursive chunk tree: each chunk has a
// uint16 ID, a uint32 total length (including the 6-byte header), and a payload of sub-chunks
// and/or inline data. Field names use the conventional 3DS documentation terms.
//
// These wire types are format-internal and stay module-scoped within the package.

// Top-level chunk IDs.
export const THREE_DS_MAIN = 0x4d4d;
export const THREE_DS_EDITOR = 0x3d3d;
export const THREE_DS_KEYFRAME = 0xb000;

// Object/mesh chunk IDs.
export const THREE_DS_OBJECT = 0x4000;
export const THREE_DS_TRIMESH = 0x4100;
export const THREE_DS_VERTICES = 0x4110;
export const THREE_DS_FACES = 0x4120;
export const THREE_DS_FACE_MATERIAL = 0x4130;
export const THREE_DS_UV_COORDS = 0x4140;
export const THREE_DS_TRANSFORM_MATRIX = 0x4160;

// Material chunk IDs.
export const THREE_DS_MATERIAL = 0xafff;
export const THREE_DS_MATERIAL_NAME = 0xa000;
export const THREE_DS_MATERIAL_AMBIENT = 0xa010;
export const THREE_DS_MATERIAL_DIFFUSE = 0xa020;
export const THREE_DS_MATERIAL_SPECULAR = 0xa030;
export const THREE_DS_MATERIAL_TEXTURE_MAP = 0xa200;
export const THREE_DS_MATERIAL_TEXTURE_FILENAME = 0xa300;

// Color sub-chunk IDs.
export const THREE_DS_COLOR_FLOAT = 0x0010;
export const THREE_DS_COLOR_BYTE = 0x0011;

// Chunk header size: uint16 id + uint32 length.
export const THREE_DS_CHUNK_HEADER_BYTES = 6;

// A parsed 3DS material descriptor.
export interface ThreeDsMaterial {
  ambient: readonly [number, number, number];
  diffuse: readonly [number, number, number];
  name: string;
  specular: readonly [number, number, number];
  textureFilename: string | null;
}

// A parsed 3DS triangle mesh descriptor (one per named object that contains a trimesh sub-chunk).
// `materialNames` lists the materials the mesh's faces reference (via FACE_MATERIAL sub-chunks), in
// file order, resolved against the file's material table by the caller.
export interface ThreeDsMesh {
  faces: Uint16Array;
  materialNames: readonly string[];
  name: string;
  uvs: Float32Array | null;
  vertices: Float32Array;
}
