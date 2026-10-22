use crate::gltf_draco::GltfDracoRegistry;
use crate::gltf_schema::{GltfDocument, GltfTextureInfoRef};
use flight_buffer::ArrayBufferView;
use flight_entity::{
    Float32Array, Int8Array, Int16Array, Record, Ref, Uint8Array, Uint16Array, Uint32Array,
};
use flight_geometry::Transform3D;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d::Scene3DDocument;
use flight_texture::{Texture, TextureColorSpace};
use std::sync::Arc;

pub struct GltfAccessorData {
    pub count: usize,
    pub data: GltfComponentArray,
    pub fault: Option<Ref<GltfAccessorFault>>,
}

pub struct GltfAccessorFault {
    pub detail: Ref<Record<f32>>,
    pub kind: String,
}

pub enum GltfComponentArray {
    Float32(GltfFloat32Array),
    Int8(GltfInt8Array),
    Int16(GltfInt16Array),
    Uint8(GltfUint8Array),
    Uint16(GltfUint16Array),
    Uint32(GltfUint32Array),
}

pub struct GltfCoreFeatureContext {
    pub build_node_transform: Arc<dyn Fn(f32) -> Transform3D + Send + Sync>,
    pub document: Ref<Scene3DDocument>,
    pub mesh_indices: Ref<Vec<Ref<Vec<i32>>>>,
    pub node_indices: Ref<Vec<i32>>,
    pub primitive_node_indices: Ref<Vec<Ref<Vec<i32>>>>,
    pub read_accessor: Arc<dyn Fn(f32, Option<&str>) -> GltfAccessorData + Send + Sync>,
    pub report_accessor_fault:
        Arc<dyn Fn(ImportDiagnosticSeverity, &Ref<GltfAccessorFault>) + Send + Sync>,
    pub report_diagnostic: Arc<
        dyn Fn(
                ImportDiagnosticSeverity,
                &str,
                Option<&Ref<Record<ImportDiagnosticDetailValue>>>,
                Option<&str>,
            ) + Send
            + Sync,
    >,
    pub source: Ref<GltfDocument>,
}

pub struct GltfCoreFeatureHandler {
    pub apply: Arc<dyn Fn(&Ref<GltfCoreFeatureContext>) + Send + Sync>,
    pub kind: String,
}

pub type GltfDracoDecoder =
    Arc<dyn Fn(&ArrayBufferView, &Ref<Record<f32>>) -> Option<Ref<GltfDracoMesh>> + Send + Sync>;

pub struct GltfDracoMesh {
    pub attributes: Ref<Record<Ref<Box<Float32Array>>>>,
    pub indices: Option<Ref<Box<Uint32Array>>>,
    pub vertex_count: usize,
}

pub struct GltfExtensionContext {
    pub build_node_transform: Arc<dyn Fn(f32) -> Transform3D + Send + Sync>,
    pub diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
    pub document: Ref<Scene3DDocument>,
    pub node_indices: Ref<Vec<i32>>,
    pub resolve_texture: Arc<
        dyn Fn(Option<&GltfTextureInfoRef>, TextureColorSpace) -> Option<Ref<Texture>>
            + Send
            + Sync,
    >,
    pub source: Ref<GltfDocument>,
}

pub struct GltfExtensionHandler {
    pub apply: Arc<dyn Fn(&Ref<GltfExtensionContext>) + Send + Sync>,
    pub kind: String,
}

pub enum GltfExternalBuffer {
    Values(GltfExternalBufferValues),
    View(GltfExternalBufferView),
}

pub struct GltfExternalBufferValues {
    pub values: Ref<Vec<f32>>,
}

pub struct GltfExternalBufferView {
    pub view: ArrayBufferView,
}

pub struct GltfImportOptions {
    pub base_path: Option<String>,
    pub extension_handlers: Option<Vec<Ref<GltfExtensionHandler>>>,
    pub external_buffers: Option<Ref<Record<GltfExternalBuffer>>>,
    /// D5 explicit caller-owned replacement for the source ambient mutable decoder slot.
    pub draco_registry: Option<Ref<GltfDracoRegistry>>,
}

pub struct GltfFloat32Array {
    pub values: Ref<Box<Float32Array>>,
}

pub struct GltfInt8Array {
    pub values: Ref<Box<Int8Array>>,
}

pub struct GltfInt16Array {
    pub values: Ref<Box<Int16Array>>,
}

pub struct GltfUint8Array {
    pub values: Ref<Box<Uint8Array>>,
}

pub struct GltfUint16Array {
    pub values: Ref<Box<Uint16Array>>,
}

pub struct GltfUint32Array {
    pub values: Ref<Box<Uint32Array>>,
}
