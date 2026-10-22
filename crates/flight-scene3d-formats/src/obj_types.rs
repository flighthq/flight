use crate::obj_schema::ObjMaterial;
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial};
use std::sync::Arc;

pub struct ObjImportOptions {
    pub material_handlers: Option<Vec<Ref<ObjMaterialHandler>>>,
}

pub struct ObjMaterialHandler {
    pub feature: String,
    pub matches: Arc<dyn Fn(&ObjMaterial) -> bool + Send + Sync>,
    pub resolve: Arc<
        dyn Fn(
                &ObjMaterial,
                &mut Scene3DDocument,
                Option<&mut Vec<ImportDiagnostic>>,
            ) -> Scene3DDocumentMaterial
            + Send
            + Sync,
    >,
}

pub const OBJ_MATERIAL_BLINN_PHONG_FEATURE: &str = "MaterialBlinnPhong";
pub const OBJ_MATERIAL_STANDARD_PBR_FEATURE: &str = "MaterialStandardPbr";
