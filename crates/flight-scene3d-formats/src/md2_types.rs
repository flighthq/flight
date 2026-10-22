use flight_entity::{Float32Array, Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;
use flight_meshgeometry::MeshMorph;
use flight_scene3d::Scene3DDocument;
use std::sync::Arc;

pub struct Md2Frame {
    pub name: String,
    pub normals: Box<Float32Array>,
    pub positions: Box<Float32Array>,
}

pub struct Md2ImportOptions {
    pub section_handlers: Option<Vec<Ref<Md2SectionHandler>>>,
}

pub struct Md2ParseContext<'a> {
    pub bytes: &'a Uint8Array,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub document: &'a mut Scene3DDocument,
    pub frames: &'a [Md2Frame],
    pub mesh_materials: &'a mut Vec<i32>,
    pub morph: Option<Ref<MeshMorph>>,
    pub num_skins: usize,
    pub off_skins: usize,
}

pub struct Md2SectionHandler {
    pub collect: Arc<dyn for<'a> Fn(&mut Md2ParseContext<'a>) + Send + Sync>,
    pub feature: String,
}
