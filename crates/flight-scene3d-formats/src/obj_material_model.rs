use crate::mtl_parse::parse_obj_material_library;
use crate::obj_schema::ObjMaterial;
use crate::obj_types::{OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE};

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn collect_obj_material_models(out: &mut Vec<String>, source: &str) {
    out.clear();
    let library = parse_obj_material_library(source, None);
    for entry in library.materials {
        let feature = if has_obj_pbr_directives(&entry.value) {
            OBJ_MATERIAL_STANDARD_PBR_FEATURE
        } else {
            OBJ_MATERIAL_BLINN_PHONG_FEATURE
        };
        if !out.iter().any(|value| value == feature) {
            out.push(feature.to_string());
        }
        if out.len() == 2 {
            break;
        }
    }
    return;
}

pub fn has_obj_pbr_directives(material: &ObjMaterial) -> bool {
    return material.roughness.is_some()
        || material.metallic.is_some()
        || material.sheen.is_some()
        || material.clearcoat.is_some()
        || material.clearcoat_roughness.is_some()
        || material.anisotropy.is_some()
        || material.anisotropy_rotation.is_some()
        || material.map_roughness.is_some()
        || material.map_metallic.is_some();
}
