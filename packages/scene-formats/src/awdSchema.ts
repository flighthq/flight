// Away3D AWD binary wire-format constants and types. These are format-internal: none are
// re-exported from the package barrel; they stay module-scoped within the package.

// AWD file header magic bytes: 'A', 'W', 'D', '\0'.
export const AWD_MAGIC_0 = 0x41; // 'A'
export const AWD_MAGIC_1 = 0x57; // 'W'
export const AWD_MAGIC_2 = 0x44; // 'D'
export const AWD_MAGIC_3 = 0x00; // '\0'

// Minimum header size: magic (3 bytes + null) + version major (1) + version minor (1) +
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

// Data type constants for attribute streams.
export const AWD_DATA_INT8 = 1;
export const AWD_DATA_INT16 = 2;
export const AWD_DATA_INT32 = 3;
export const AWD_DATA_UINT8 = 4;
export const AWD_DATA_UINT16 = 5;
export const AWD_DATA_UINT32 = 6;
export const AWD_DATA_FLOAT32 = 7;
export const AWD_DATA_FLOAT64 = 8;
