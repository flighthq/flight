use crate::three_ds_schema::{
    ThreeDsCamera, ThreeDsDropTally, ThreeDsLight, ThreeDsMaterial, ThreeDsMesh,
};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::Scene3DDocument;
use std::sync::Arc;

pub type ThreeDsChunkDispatch = Vec<ThreeDsChunkDispatchEntry>;

pub struct ThreeDsChunkDispatchEntry {
    pub chunk_id: u16,
    pub handler: Ref<ThreeDsChunkHandler>,
}

pub struct ThreeDsChunkHandler {
    pub build: Option<Arc<dyn for<'a> Fn(&mut ThreeDsParseState<'a>) + Send + Sync>>,
    pub chunk_ids: Vec<u16>,
    pub collect: Arc<
        dyn for<'a> Fn(&mut ThreeDsParseState<'a>, &Uint8Array, usize, usize, &str) + Send + Sync,
    >,
}

pub struct ThreeDsDropTallyEntry {
    pub key: String,
    pub value: ThreeDsDropTally,
}

pub struct ThreeDsImportOptions {
    pub handlers: Option<Vec<Ref<ThreeDsChunkHandler>>>,
}

pub struct ThreeDsMaterialEntry {
    pub key: String,
    pub value: ThreeDsMaterial,
}

pub struct ThreeDsParseState<'a> {
    pub cameras: Vec<ThreeDsCamera>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub drops: Option<Vec<ThreeDsDropTallyEntry>>,
    pub document: &'a mut Scene3DDocument,
    pub lights: Vec<ThreeDsLight>,
    pub materials: Vec<ThreeDsMaterialEntry>,
    pub meshes: Vec<ThreeDsMesh>,
    pub pivots: Vec<ThreeDsPivotEntry>,
}

pub struct ThreeDsPivotEntry {
    pub key: String,
    pub value: [f32; 3],
}
