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
    pub orientation_w: f32,
    pub orientation_x: f32,
    pub orientation_y: f32,
    pub orientation_z: f32,
    pub parent_index: i32,
    pub position_x: f32,
    pub position_y: f32,
    pub position_z: f32,
}

pub struct Md5Mesh {
    pub indices: Vec<f32>,
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
    pub u: f32,
    pub v: f32,
}

pub struct Md5Weight {
    pub bias: f32,
    pub joint_index: i32,
    pub position_x: f32,
    pub position_y: f32,
    pub position_z: f32,
}

pub const MD5_MATERIAL_FEATURE: &str = "Material";
pub const MD5_SKELETON_FEATURE: &str = "Skeleton";
