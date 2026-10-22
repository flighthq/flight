use crate::obj_material_helpers::{external_obj_texture, pack_obj_color};
use crate::obj_material_model::has_obj_pbr_directives;
use crate::obj_schema::ObjMaterial;
use crate::obj_types::{OBJ_MATERIAL_BLINN_PHONG_FEATURE, ObjMaterialHandler};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::contract::create_blinn_phong_material;
use flight_materials::{BlinnPhongMaterial, Material3D, MaterialAlphaMode};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_texture::TextureColorSpace;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static OBJ_BLINN_PHONG_MATERIAL_HANDLER: LazyLock<Ref<ObjMaterialHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(ObjMaterialHandler {
            feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE.to_string(),
            matches: Arc::new(|material| !has_obj_pbr_directives(material)),
            resolve: Arc::new(|material, document, diagnostics| {
                let value = obj_material_to_blinn_phong(document, material, diagnostics);
                return Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
                    material: Arc::new(RwLock::new(value)),
                });
            }),
        }))
    });

// flight-lint: allow(conform-params) D9 mutable document resource destination precedes material input; source order is material,document,diagnostics
pub fn obj_material_to_blinn_phong(
    out: &mut Scene3DDocument,
    material: &ObjMaterial,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> BlinnPhongMaterial {
    let alpha_map = external_obj_texture(
        out,
        material.map_dissolve.as_deref(),
        TextureColorSpace::Linear,
    );
    let diffuse_map = external_obj_texture(
        out,
        material.map_diffuse.as_deref(),
        TextureColorSpace::Srgb,
    );
    let normal_map = external_obj_texture(
        out,
        material.map_normal.as_deref(),
        TextureColorSpace::Linear,
    );
    let specular_map = external_obj_texture(
        out,
        material.map_specular.as_deref(),
        TextureColorSpace::Srgb,
    );
    let mut result = create_blinn_phong_material();
    result.alpha_map = alpha_map;
    result.diffuse = pack_obj_color(&material.diffuse, material.dissolve);
    result.diffuse_map = diffuse_map;
    result.normal_map = normal_map;
    result.shininess = material.specular_exponent;
    result.specular = pack_obj_color(&material.specular, 1.0);
    result.specular_map = specular_map;
    if material.dissolve < 1.0 || material.map_dissolve.is_some() {
        result.material3d_fields_mut().alpha_mode = MaterialAlphaMode::Blend;
    }
    if material.emissive.is_some() || material.map_emissive.is_some() {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "mtl.emissive-dropped",
            "resolveObjMaterial",
            Some(HashMap::from([(
                "name".to_string(),
                ImportDiagnosticDetailValue::String(material.name.clone()),
            )])),
        );
    }
    if material.map_bump.is_some() {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "mtl.bump-height-map-unbound",
            "objMaterialToBlinnPhong",
            Some(HashMap::from([(
                "name".to_string(),
                ImportDiagnosticDetailValue::String(material.name.clone()),
            )])),
        );
    }
    return result;
}
