//! `flighthq-scene-formats` — import 3D scene data from industry-standard
//! formats.
//!
//! Ports the TypeScript `@flighthq/scene-formats` package. The initial proving
//! slice covers glTF 2.0 JSON (node hierarchy + mesh geometry from embedded
//! base64 buffers); GLB binary, animations, skins, materials, and sparse
//! accessors are deferred.
//!
//! # glTF 2.0
//!
//! [`parse_gltf_document`] converts a glTF 2.0 JSON string into a
//! [`ParsedGltf`]: a paired `SceneArena` + `HierarchyArena` with all nodes
//! constructed and wired, plus a `node_geometries` map from `NodeId` to
//! `MeshGeometry` for nodes that reference a glTF mesh.

pub mod gltf_parse;
pub mod gltf_schema;

pub use gltf_parse::{ParsedGltf, parse_gltf_document};
pub use gltf_schema::{
    GltfAccessor, GltfBuffer, GltfBufferView, GltfDocument, GltfMesh, GltfNode, GltfPrimitive,
    GltfPrimitiveAttributes, GltfScene,
};
