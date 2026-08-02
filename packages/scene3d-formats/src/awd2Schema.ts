// Away3D AWD binary wire-format constants and types. These are format-internal: none are
// re-exported from the package barrel; they stay module-scoped within the package.

// AWD file header magic bytes: 'A', 'W', 'D'.
export const AWD2_MAGIC_0 = 0x41; // 'A'
export const AWD2_MAGIC_1 = 0x57; // 'W'
export const AWD2_MAGIC_2 = 0x44; // 'D'

// Header size: magic (3) + version major (1) + version minor (1) +
// flags (2) + compression (1) + body length (4) = 12 bytes.
export const AWD2_HEADER_BYTES = 12;

// Header byte offset of the version-major field, and the only major version this parser reads. A
// version-3 file (AWD3, AwayJS's Scene3DGraph format) shares the 'AWD' magic but has an entirely different
// block model, so it is rejected by version rather than misparsed by the AWD2 block walk.
export const AWD2_VERSION_MAJOR_OFFSET = 3;
export const AWD2_FORMAT_VERSION = 2;

// Block header size: blockId (4) + namespace (1) + blockType (1) + flags (1) + blockLength (4) = 11 bytes.
export const AWD2_BLOCK_HEADER_BYTES = 11;

// AWD core namespace identifier.
export const AWD2_NAMESPACE_CORE = 0;

// Block type constants (namespace 0 — AWD core).
export const AWD2_BLOCK_TRIANGLE_GEOMETRY = 1;
export const AWD2_BLOCK_CONTAINER = 22;
export const AWD2_BLOCK_MESH_INSTANCE = 23;
export const AWD2_BLOCK_LIGHT = 41;
export const AWD2_BLOCK_CAMERA = 42;
export const AWD2_BLOCK_LIGHT_PICKER = 51;
export const AWD2_BLOCK_MATERIAL = 81;
export const AWD2_BLOCK_TEXTURE = 82;
export const AWD2_BLOCK_SKELETON = 101;
export const AWD2_BLOCK_SKELETON_POSE = 102;
export const AWD2_BLOCK_SKELETON_ANIMATION = 103;

// Material block (type 81) `matType` byte, read after the material name: a flat color material or
// a textured material.
export const AWD2_MATERIAL_TYPE_COLOR = 1;
export const AWD2_MATERIAL_TYPE_TEXTURE = 2;

// Texture block (type 82) `texType` byte, read after the texture name: an embedded image payload
// or an external URL reference. Flight can only realize the embedded form (the URL form is left as
// a warned, unresolved slot — the host would have to fetch it).
export const AWD2_TEXTURE_TYPE_EXTERNAL = 0;
export const AWD2_TEXTURE_TYPE_EMBEDDED = 1;

// Material block typed-property keys (the property list is a uint32 byte-length prefix followed by
// `uint16 key, uint32 fieldLength, <value>` records — the same envelope as an AWD attribute list).
// Only the keys Flight consumes are named; unknown keys are skipped by length.
export const AWD2_MATERIAL_PROP_COLOR = 1; // uint32 packed 0xrrggbb color (color materials)
export const AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE = 2; // block id (baddr) of the diffuse/albedo texture
export const AWD2_MATERIAL_PROP_NORMAL_TEXTURE = 3; // block id (baddr) of the normal texture
export const AWD2_MATERIAL_PROP_ALPHA = 10; // float32 material alpha (opacity); real AWD2 files carry this on every material

// Light block (type 41) `lightType` byte, read after the light name. Away3D only ever emits these two
// (its own parser maps everything else to "Unsupported LightType"); there is no AWD2 spot light.
// Camera block (type 42) projection-type shorts, read after the name and two skipped lens fields.
// 5003 is an OFF-CENTER orthographic: it states left/right/bottom/top independently, so its view volume
// need not be centred on the axis.
export const AWD2_CAMERA_PROJECTION_PERSPECTIVE = 5001;
export const AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC = 5002;
export const AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER = 5003;

// Camera block typed-property keys. For a perspective camera key 101 is the VERTICAL field of view in
// degrees; for an off-center orthographic one, 101/102 are left/right and 103/104 bottom/top.
export const AWD2_CAMERA_PROP_FOV = 101;
export const AWD2_CAMERA_PROP_ORTHO_LEFT = 101;
export const AWD2_CAMERA_PROP_ORTHO_RIGHT = 102;
export const AWD2_CAMERA_PROP_ORTHO_BOTTOM = 103;
export const AWD2_CAMERA_PROP_ORTHO_TOP = 104;

export const AWD2_LIGHT_TYPE_POINT = 1;
export const AWD2_LIGHT_TYPE_DIRECTIONAL = 2;

// Light block typed-property keys, in the same `uint16 key, uint32 fieldLength, <value>` envelope as a
// material property list. An AWD light is one entity carrying BOTH a punctual term (color × diffuse,
// placed or aimed) and its own ambient term (ambientColor × ambient) — which is why one block imports as
// a punctual Flight light PLUS a separate AmbientLight. Keys absent from a block take the AWD defaults
// named below (Away3D's own fallbacks), so absence is a defined value and not a parse fault.
export const AWD2_LIGHT_PROP_RADIUS = 1; // float — point-light falloff START distance; default 90000
export const AWD2_LIGHT_PROP_FALLOFF = 2; // float — point-light falloff END (cutoff) distance; default 100000
export const AWD2_LIGHT_PROP_COLOR = 3; // uint32 packed 0xrrggbb punctual color; default 0xffffff
export const AWD2_LIGHT_PROP_SPECULAR = 4; // float specular multiplier; default 1
export const AWD2_LIGHT_PROP_DIFFUSE = 5; // float diffuse multiplier — the punctual light's intensity; default 1
export const AWD2_LIGHT_PROP_AMBIENT_COLOR = 7; // uint32 packed 0xrrggbb ambient color; default 0xffffff
export const AWD2_LIGHT_PROP_AMBIENT = 8; // float ambient multiplier — the ambient light's intensity; default 0
export const AWD2_LIGHT_PROP_SHADOW_MAPPER = 9; // uint8 shadow-mapper type; 0 = the light casts no shadow
export const AWD2_LIGHT_PROP_DIRECTION_X = 21; // float — directional light aim, AWD left-handed; default 0
export const AWD2_LIGHT_PROP_DIRECTION_Y = 22; // float — directional light aim, AWD left-handed; default -1
export const AWD2_LIGHT_PROP_DIRECTION_Z = 23; // float — directional light aim, AWD left-handed; default 1

// AWD light property defaults, applied when the key is absent from the block's property list.
export const AWD2_LIGHT_DEFAULT_RADIUS = 90000;
export const AWD2_LIGHT_DEFAULT_FALLOFF = 100000;
export const AWD2_LIGHT_DEFAULT_RGB = 0xffffff;
export const AWD2_LIGHT_DEFAULT_SPECULAR = 1;
export const AWD2_LIGHT_DEFAULT_DIFFUSE = 1;
export const AWD2_LIGHT_DEFAULT_AMBIENT = 0;

// Compression method constants from the AWD header.
export const AWD2_COMPRESSION_NONE = 0;
export const AWD2_COMPRESSION_DEFLATE = 1;
export const AWD2_COMPRESSION_LZMA = 2;

// Attribute stream type constants within a TriangleGeometry sub-mesh.
export const AWD2_STREAM_POSITIONS = 1;
export const AWD2_STREAM_INDICES = 2;
export const AWD2_STREAM_UVS = 3;
export const AWD2_STREAM_NORMALS = 4;
export const AWD2_STREAM_TANGENTS = 5;
export const AWD2_STREAM_JOINT_INDICES = 6;
export const AWD2_STREAM_JOINT_WEIGHTS = 7;

// Sentinel parent index indicating a root joint in a skeleton block.
export const AWD2_ROOT_JOINT_PARENT = 0xffff;

// Data type constants for attribute streams.
export const AWD2_DATA_INT8 = 1;
export const AWD2_DATA_INT16 = 2;
export const AWD2_DATA_INT32 = 3;
export const AWD2_DATA_UINT8 = 4;
export const AWD2_DATA_UINT16 = 5;
export const AWD2_DATA_UINT32 = 6;
export const AWD2_DATA_FLOAT32 = 7;
export const AWD2_DATA_FLOAT64 = 8;
