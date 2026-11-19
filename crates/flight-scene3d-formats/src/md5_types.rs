//! flight-compiler: rust-only

// flight-lint: allow-file(f64) Task Q format numbers: glTF JSON, COLLADA, MD5 and OBJ text numbers are JS Numbers held in f64, and binary AWD2/3DS/MD2/STL/glTF f32 fields widen exactly at decode; vertex, material, color and diagnostic lanes stay f32

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d::Scene3DDocument;
use std::collections::HashMap;
use std::sync::Arc;

pub struct Md5DropTally {
    pub count: usize,
    pub detail: HashMap<String, ImportDiagnosticDetailValue>,
    pub kind: String,
    pub severity: ImportDiagnosticSeverity,
}

/// One insertion-ordered entry of the source Map<string, Md5DropTally>.
pub struct Md5DropTallyEntry {
    pub key: String,
    pub value: Md5DropTally,
}

pub struct Md5ImportOptions {
    pub section_handlers: Option<Vec<Ref<Md5SectionHandler>>>,
}

pub struct Md5Joint {
    pub name: String,
    pub orientation_w: f64,
    pub orientation_x: f64,
    pub orientation_y: f64,
    pub orientation_z: f64,
    pub parent_index: i32,
    pub position_x: f64,
    pub position_y: f64,
    pub position_z: f64,
}

pub struct Md5Mesh {
    pub indices: Vec<f64>,
    pub shader: String,
    pub vertices: Vec<Md5Vertex>,
    pub weights: Vec<Md5Weight>,
}

pub struct Md5MeshSection<'a> {
    pub materials: &'a mut Vec<i32>,
    pub shader: &'a str,
}

pub struct Md5ParseContext<'a> {
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub document: &'a mut Scene3DDocument,
    pub drops: Option<&'a mut Vec<Md5DropTallyEntry>>,
    pub joints: &'a [Md5Joint],
    pub mesh: Option<Md5MeshSection<'a>>,
    pub skin: Option<i32>,
}

pub struct Md5SectionHandler {
    pub collect: Arc<dyn for<'a> Fn(&mut Md5ParseContext<'a>) + Send + Sync>,
    pub feature: String,
}

pub struct Md5Vertex {
    pub count_weights: i32,
    pub start_weight: i32,
    pub u: f64,
    pub v: f64,
}

pub struct Md5Weight {
    pub bias: f64,
    pub joint_index: i32,
    pub position_x: f64,
    pub position_y: f64,
    pub position_z: f64,
}

pub const MD5_MATERIAL_FEATURE: &str = "Material";
pub const MD5_SKELETON_FEATURE: &str = "Skeleton";
