// Away3D AWD binary wire-format constants and types. These are format-internal: none are
// re-exported from the package barrel; they stay module-scoped within the package.

// AWD file header magic bytes: 'A', 'W', 'D'.
export const AWD_MAGIC_0 = 0x41; // 'A'
export const AWD_MAGIC_1 = 0x57; // 'W'
export const AWD_MAGIC_2 = 0x44; // 'D'

// Header size: magic (3) + version major (1) + version minor (1) +
// flags (2) + compression (1) + body length (4) = 12 bytes.
export const AWD_HEADER_BYTES = 12;

// Block header size: blockId (4) + namespace (1) + blockType (1) + flags (1) + blockLength (4) = 11 bytes.
export const AWD_BLOCK_HEADER_BYTES = 11;

// AWD core namespace identifier.
export const AWD_NAMESPACE_CORE = 0;

// Block type constants (namespace 0 — AWD core).
export const AWD_BLOCK_TRIANGLE_GEOMETRY = 1;
export const AWD_BLOCK_CONTAINER = 22;
export const AWD_BLOCK_MESH_INSTANCE = 23;
export const AWD_BLOCK_MATERIAL = 81;
export const AWD_BLOCK_TEXTURE = 82;
export const AWD_BLOCK_SKELETON = 101;
export const AWD_BLOCK_SKELETON_POSE = 102;
export const AWD_BLOCK_SKELETON_ANIMATION = 103;

// Material block (type 81) `matType` byte, read after the material name: a flat color material or
// a textured material.
export const AWD_MATERIAL_TYPE_COLOR = 1;
export const AWD_MATERIAL_TYPE_TEXTURE = 2;

// Texture block (type 82) `texType` byte, read after the texture name: an embedded image payload
// or an external URL reference. Flight can only realize the embedded form (the URL form is left as
// a warned, unresolved slot — the host would have to fetch it).
export const AWD_TEXTURE_TYPE_EXTERNAL = 0;
export const AWD_TEXTURE_TYPE_EMBEDDED = 1;

// Material block typed-property keys (the property list is a uint32 byte-length prefix followed by
// `uint16 key, uint32 fieldLength, <value>` records — the same envelope as an AWD attribute list).
// Only the keys Flight consumes are named; unknown keys are skipped by length.
export const AWD_MATERIAL_PROP_COLOR = 1; // uint32 packed 0xrrggbb color (color materials)
export const AWD_MATERIAL_PROP_DIFFUSE_TEXTURE = 2; // block id (baddr) of the diffuse/albedo texture
export const AWD_MATERIAL_PROP_NORMAL_TEXTURE = 3; // block id (baddr) of the normal texture

// Compression method constants from the AWD header.
export const AWD_COMPRESSION_NONE = 0;
export const AWD_COMPRESSION_DEFLATE = 1;
export const AWD_COMPRESSION_LZMA = 2;

// Attribute stream type constants within a TriangleGeometry sub-mesh.
export const AWD_STREAM_POSITIONS = 1;
export const AWD_STREAM_INDICES = 2;
export const AWD_STREAM_UVS = 3;
export const AWD_STREAM_NORMALS = 4;
export const AWD_STREAM_TANGENTS = 5;
export const AWD_STREAM_JOINT_INDICES = 6;
export const AWD_STREAM_JOINT_WEIGHTS = 7;

// Sentinel parent index indicating a root joint in a skeleton block.
export const AWD_ROOT_JOINT_PARENT = 0xffff;

// Data type constants for attribute streams.
export const AWD_DATA_INT8 = 1;
export const AWD_DATA_INT16 = 2;
export const AWD_DATA_INT32 = 3;
export const AWD_DATA_UINT8 = 4;
export const AWD_DATA_UINT16 = 5;
export const AWD_DATA_UINT32 = 6;
export const AWD_DATA_FLOAT32 = 7;
export const AWD_DATA_FLOAT64 = 8;
