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

// A parsed 3DS material descriptor. `shininess` is the Blinn-Phong specular exponent derived from the
// MAT_SHININESS percentage, or null when absent (so an explicit 0 stays 0 rather than reverting to the
// material default). `opacity` is 0..1 (1 = fully opaque) from MAT_TRANSPARENCY. `bumpFilename` is the
// MAT_BUMPMAP filename — a legacy grayscale HEIGHT map kept as metadata only (NOT a tangent-space normal
// map, so it is not bound to a material normalMap; see the scene-formats status log), or null.
export interface ThreeDsMaterial {
  ambient: readonly [number, number, number];
  bumpFilename: string | null;
  diffuse: readonly [number, number, number];
  name: string;
  opacity: number;
  // MAT_OPACMAP (0xA210) filename — a dedicated coverage image, or null. Distinct from `opacity`, which
  // is the scalar MAT_TRANSPARENCY: a material may state both, and they multiply.
  opacityFilename: string | null;
  shininess: number | null;
  specular: readonly [number, number, number];
  textureFilename: string | null;
}

// A parsed 3DS light descriptor (one per named object carrying an N_DIRECT_LIGHT sub-chunk). Positions
// are in the file's own right-handed Z-up space — the caller converts them, exactly as it does mesh
// vertices. `target` is the point a spot light aims AT (not a direction vector); it is null for a point
// light, and its presence is what makes the light a spot. `hotspot`/`falloff` are the two cone half-angles
// in DEGREES: `hotspot` is the full-intensity inner cone and `falloff` the outer cone where intensity
// reaches zero. Both are absolute angles measured from the cone axis — `falloff` is not an offset added to
// `hotspot`. `multiplier` scales the color's intensity (1 = unscaled). `outerRange` is the distance cutoff
// and `innerRange` the distance at which attenuation begins, or null when the file states neither.
// `enabled` is false when the DL_OFF flag chunk is present — an authored-but-disabled light.
export interface ThreeDsLight {
  color: readonly [number, number, number];
  enabled: boolean;
  falloff: number;
  hotspot: number;
  innerRange: number | null;
  multiplier: number;
  name: string;
  outerRange: number | null;
  position: readonly [number, number, number];
  target: readonly [number, number, number] | null;
}

// A parsed 3DS camera descriptor (one per named object carrying an N_CAMERA sub-chunk). `position` and
// `target` are in the file's right-handed Z-up space; the camera aims from the former at the latter, so
// the caller derives a direction rather than reading one. `roll` is the bank angle about that aim axis in
// DEGREES. `focalLength` is a lens focal length in MILLIMETRES, not an angle — convert it against
// THREE_DS_CAMERA_APERTURE_MM to recover a field of view. `near`/`far` come from the CAM_RANGES sub-chunk
// and are null when the file omits it.
export interface ThreeDsCamera {
  far: number | null;
  focalLength: number;
  name: string;
  near: number | null;
  position: readonly [number, number, number];
  roll: number;
  target: readonly [number, number, number];
}

// A per-material face group within a 3DS mesh (a FACE_MATERIAL 0x4130 sub-chunk): the material `name`
// and the `faces` — indices into the mesh's triangle list (each addressing one `ThreeDsMesh.faces`
// triple) — that use it. The caller resolves the name against the file's material table and partitions
// the geometry into one MeshSubset per group.
export interface ThreeDsMaterialGroup {
  faces: Uint16Array;
  name: string;
}

// A parsed 3DS triangle mesh descriptor (one per named object that contains a trimesh sub-chunk).
// `materialGroups` are the FACE_MATERIAL sub-chunks — each names a material and the faces that use it,
// resolved and partitioned into subsets by the caller. `smoothingGroups` is the per-face smoothing
// bitmask (SMOOTH_GROUP 0x4150, one uint32 per face) driving per-group normal generation, or null when
// the mesh carries no smoothing chunk (all faces smoothed together).
//
// `vertices` are in WORLD space, which is what the format stores — not model space. `localMatrix` is the
// TRI_LOCAL (0x4160) placement that puts them there: 12 float32 in file order, four contiguous 3-vectors
// naming the object's X, Y, and Z axes and then its origin. Recovering model-space geometry means
// applying its INVERSE to the vertices; the matrix itself then becomes the node's transform. It is null
// when the mesh carries no TRI_LOCAL chunk, which is the identity-placement case.
export interface ThreeDsMesh {
  faces: Uint16Array;
  localMatrix: Float32Array | null;
  materialGroups: readonly ThreeDsMaterialGroup[];
  name: string;
  smoothingGroups: Uint32Array | null;
  uvs: Float32Array | null;
  vertices: Float32Array;
}
