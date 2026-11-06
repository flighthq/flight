// Owned by `@flighthq/scene3d-formats`. These deprecated re-exports keep existing `@flighthq/types`
// imports compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/scene3d-formats/contract`. */
export type {
  ThreeDsMaterial,
  ThreeDsDropTally,
  ThreeDsLight,
  ThreeDsCamera,
  ThreeDsMaterialGroup,
  ThreeDsMesh,
} from '@flighthq/scene3d-formats/contract';

// Deprecated structural copies of scene3d-formats' literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
// Autodesk 3DS binary chunked format — chunk ID constants and descriptor interfaces for the subset
// @flighthq/scene3d-formats imports. The 3DS format is a recursive chunk tree: each chunk has a
// uint16 ID, a uint32 total length (including the 6-byte header), and a payload of sub-chunks
// and/or inline data. Field names use the conventional 3DS documentation terms.
//
// These wire types are format-internal and stay module-scoped within the package.

// Top-level chunk IDs.
export const THREE_DS_MAIN = 0x4d4d;
export const THREE_DS_EDITOR = 0x3d3d;
export const THREE_DS_KEYFRAME = 0xb000;

// Keyframer sub-chunks. Only the two that are UNAMBIGUOUS are named: a node tag's header (whose name is a
// plain NUL-terminated string) and its pivot (three float32). The header's trailing uint16 encodes the
// node's place in the hierarchy, and two documented readings of it disagree — see the 3DS section of
// agents/scene3d-format-coverage.md — so it is deliberately not named or read here.
export const THREE_DS_KEYFRAME_OBJECT_NODE = 0xb002;
export const THREE_DS_KEYFRAME_NODE_HEADER = 0xb010;
export const THREE_DS_KEYFRAME_PIVOT = 0xb013;

// Object/mesh chunk IDs.
export const THREE_DS_OBJECT = 0x4000;
export const THREE_DS_TRIMESH = 0x4100;
export const THREE_DS_VERTICES = 0x4110;
export const THREE_DS_FACES = 0x4120;
export const THREE_DS_FACE_MATERIAL = 0x4130;
export const THREE_DS_UV_COORDS = 0x4140;
export const THREE_DS_SMOOTH_GROUP = 0x4150;
export const THREE_DS_TRANSFORM_MATRIX = 0x4160;

// Light chunk IDs. A light is a named object (0x4000) whose sub-chunk is N_DIRECT_LIGHT rather than a
// trimesh; the spotlight sub-chunk is what promotes it from a point light to a cone-restricted one.
export const THREE_DS_LIGHT = 0x4600;
export const THREE_DS_LIGHT_SPOT = 0x4610;
export const THREE_DS_LIGHT_OFF = 0x4620;
export const THREE_DS_LIGHT_INNER_RANGE = 0x4659;
export const THREE_DS_LIGHT_OUTER_RANGE = 0x465a;
export const THREE_DS_LIGHT_MULTIPLIER = 0x465b;

// Camera chunk IDs. Like a light, a camera is a named object whose sub-chunk is N_CAMERA.
export const THREE_DS_CAMERA = 0x4700;
export const THREE_DS_CAMERA_RANGES = 0x4720;

// The film-aperture width, in millimetres, that 3DS camera focal lengths are measured against. The
// N_CAMERA chunk states a lens as a focal length, not an angle, so recovering a field of view needs the
// aperture it was metered on: fovX = 2*atan(THREE_DS_CAMERA_APERTURE_MM / (2*focalLength)). 3DS predates
// configurable sensor sizes and fixes this at the 35mm-film gate.
export const THREE_DS_CAMERA_APERTURE_MM = 36;

// Material chunk IDs.
export const THREE_DS_MATERIAL = 0xafff;
export const THREE_DS_MATERIAL_NAME = 0xa000;
export const THREE_DS_MATERIAL_AMBIENT = 0xa010;
export const THREE_DS_MATERIAL_DIFFUSE = 0xa020;
export const THREE_DS_MATERIAL_SPECULAR = 0xa030;
export const THREE_DS_MATERIAL_SHININESS = 0xa040;
export const THREE_DS_MATERIAL_TRANSPARENCY = 0xa050;
export const THREE_DS_MATERIAL_TEXTURE_MAP = 0xa200;
export const THREE_DS_MATERIAL_OPACITY_MAP = 0xa210;
export const THREE_DS_MATERIAL_TEXTURE_FILENAME = 0xa300;
export const THREE_DS_MATERIAL_BUMP_MAP = 0xa230;

// Color sub-chunk IDs.
export const THREE_DS_COLOR_FLOAT = 0x0010;
export const THREE_DS_COLOR_BYTE = 0x0011;

// Percentage sub-chunk IDs (used by shininess/transparency): INT is a uint16 in [0,100], FLOAT is a
// float32 fraction in [0,1].
export const THREE_DS_PERCENT_INT = 0x0030;
export const THREE_DS_PERCENT_FLOAT = 0x0031;

// Chunk header size: uint16 id + uint32 length.
export const THREE_DS_CHUNK_HEADER_BYTES = 6;
