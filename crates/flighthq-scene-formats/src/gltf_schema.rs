//! glTF 2.0 JSON wire-format schema — the subset `flighthq-scene-formats`
//! imports today (node hierarchy + mesh geometry from embedded base64
//! buffers). Field names in serde match the glTF 2.0 spec (camelCase) exactly.
//! Indices into the document's parallel arrays are the spec's referencing model.
//!
//! Ports `@flighthq/scene-formats` `gltfSchema.ts`.

use serde::Deserialize;

/// Top-level glTF 2.0 document.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GltfDocument {
    pub asset: GltfAsset,
    pub scene: Option<usize>,
    pub scenes: Option<Vec<GltfScene>>,
    pub nodes: Option<Vec<GltfNode>>,
    pub meshes: Option<Vec<GltfMesh>>,
    pub accessors: Option<Vec<GltfAccessor>>,
    pub buffer_views: Option<Vec<GltfBufferView>>,
    pub buffers: Option<Vec<GltfBuffer>>,
}

/// glTF asset metadata.
#[derive(Debug, Deserialize)]
pub struct GltfAsset {
    pub version: String,
}

/// A named root set of top-level node indices.
#[derive(Debug, Deserialize)]
pub struct GltfScene {
    pub name: Option<String>,
    pub nodes: Option<Vec<usize>>,
}

/// A scene graph node: optional name, children, mesh reference, and either a
/// column-major 4×4 `matrix` or separate TRS components. A node carries EITHER
/// `matrix` OR the TRS fields — not both.
#[derive(Debug, Deserialize)]
pub struct GltfNode {
    pub name: Option<String>,
    pub children: Option<Vec<usize>>,
    pub mesh: Option<usize>,
    /// 16-element column-major transform matrix. Mutually exclusive with TRS.
    pub matrix: Option<[f32; 16]>,
    pub translation: Option<[f32; 3]>,
    /// Quaternion stored as `[x, y, z, w]`.
    pub rotation: Option<[f32; 4]>,
    pub scale: Option<[f32; 3]>,
}

/// A named list of draw primitives.
#[derive(Debug, Deserialize)]
pub struct GltfMesh {
    pub name: Option<String>,
    pub primitives: Vec<GltfPrimitive>,
}

/// One drawable primitive: vertex attribute accessor references, an optional
/// index accessor, and an optional material and topology mode.
#[derive(Debug, Deserialize)]
pub struct GltfPrimitive {
    pub attributes: GltfPrimitiveAttributes,
    pub indices: Option<usize>,
    pub material: Option<usize>,
    pub mode: Option<u32>,
}

/// Vertex attribute accessor indices. Only the subset used by `gltfParse` is
/// covered (POSITION, NORMAL, TEXCOORD_0).
#[derive(Debug, Deserialize)]
pub struct GltfPrimitiveAttributes {
    #[serde(rename = "POSITION")]
    pub position: Option<usize>,
    #[serde(rename = "NORMAL")]
    pub normal: Option<usize>,
    #[serde(rename = "TEXCOORD_0")]
    pub texcoord_0: Option<usize>,
}

/// glTF accessor `componentType` GL constants.
///
/// | Value  | Type             |
/// |--------|------------------|
/// | 5120   | BYTE             |
/// | 5121   | UNSIGNED_BYTE    |
/// | 5122   | SHORT            |
/// | 5123   | UNSIGNED_SHORT   |
/// | 5125   | UNSIGNED_INT     |
/// | 5126   | FLOAT            |
pub type GltfComponentType = u32;

/// Describes how to interpret a slice of a buffer view as typed data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GltfAccessor {
    pub buffer_view: Option<usize>,
    pub byte_offset: Option<u64>,
    pub component_type: GltfComponentType,
    pub count: usize,
    pub normalized: Option<bool>,
    /// Element type: `"SCALAR"`, `"VEC2"`, `"VEC3"`, `"VEC4"`, `"MAT2"`,
    /// `"MAT3"`, or `"MAT4"`.
    #[serde(rename = "type")]
    pub accessor_type: String,
}

/// A contiguous view into a buffer (byte range + optional stride).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GltfBufferView {
    pub buffer: usize,
    pub byte_length: u64,
    pub byte_offset: Option<u64>,
    pub byte_stride: Option<u64>,
}

/// A binary buffer, currently only embedded data URIs are supported.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GltfBuffer {
    pub byte_length: u64,
    pub uri: Option<String>,
}
