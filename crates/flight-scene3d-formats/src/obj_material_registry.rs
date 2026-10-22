use crate::obj_blinn_phong_material_handler::OBJ_BLINN_PHONG_MATERIAL_HANDLER;
use crate::obj_standard_pbr_material_handler::OBJ_STANDARD_PBR_MATERIAL_HANDLER;
use crate::obj_types::ObjMaterialHandler;
use flight_entity::Ref;
use std::sync::LazyLock;

pub static OBJ_BLINN_PHONG_MATERIAL_FAMILY: LazyLock<Vec<Ref<ObjMaterialHandler>>> =
    LazyLock::new(|| vec![OBJ_BLINN_PHONG_MATERIAL_HANDLER.clone()]);
pub static OBJ_STANDARD_PBR_MATERIAL_FAMILY: LazyLock<Vec<Ref<ObjMaterialHandler>>> =
    LazyLock::new(|| vec![OBJ_STANDARD_PBR_MATERIAL_HANDLER.clone()]);
pub static OBJ_ALL_MATERIAL_HANDLERS: LazyLock<Vec<Ref<ObjMaterialHandler>>> =
    LazyLock::new(|| {
        let mut handlers = OBJ_BLINN_PHONG_MATERIAL_FAMILY.clone();
        handlers.extend(OBJ_STANDARD_PBR_MATERIAL_FAMILY.iter().cloned());
        return handlers;
    });
