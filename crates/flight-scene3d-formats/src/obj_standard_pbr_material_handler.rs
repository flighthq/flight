use crate::obj_material_helpers::{external_obj_texture, pack_obj_color};
use crate::obj_material_model::has_obj_pbr_directives;
use crate::obj_schema::ObjMaterial;
use crate::obj_types::{OBJ_MATERIAL_STANDARD_PBR_FEATURE, ObjMaterialHandler};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::contract::create_standard_pbr_material;
use flight_materials::{Material3D, MaterialAlphaMode, StandardPbrMaterial};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_texture::TextureColorSpace;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static OBJ_STANDARD_PBR_MATERIAL_HANDLER: LazyLock<Ref<ObjMaterialHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(ObjMaterialHandler {
            feature: OBJ_MATERIAL_STANDARD_PBR_FEATURE.to_string(),
            matches: Arc::new(has_obj_pbr_directives),
            resolve: Arc::new(|material, document, diagnostics| {
                let value = obj_material_to_standard_pbr(document, material, diagnostics);
                return Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
                    material: Arc::new(RwLock::new(value)),
                });
            }),
        }))
    });

// flight-lint: allow(conform-params) D9 mutable document resource destination precedes material input; source order is material,document,diagnostics
pub fn obj_material_to_standard_pbr(
    out: &mut Scene3DDocument,
    material: &ObjMaterial,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> StandardPbrMaterial {
    let alpha_map = external_obj_texture(
        out,
        material.map_dissolve.as_deref(),
        TextureColorSpace::Linear,
    );
    let base_color_map = external_obj_texture(
        out,
        material.map_diffuse.as_deref(),
        TextureColorSpace::Srgb,
    );
    let emissive_map = external_obj_texture(
        out,
        material.map_emissive.as_deref(),
        TextureColorSpace::Srgb,
    );
    let normal_map = external_obj_texture(
        out,
        material.map_normal.as_deref(),
        TextureColorSpace::Linear,
    );
    let mut result = create_standard_pbr_material();
    result.alpha_map = alpha_map;
    result.base_color = pack_obj_color(&material.diffuse, material.dissolve);
    result.base_color_map = base_color_map;
    result.emissive_map = emissive_map;
    result.normal_map = normal_map;
    result.emissive = material
        .emissive
        .as_ref()
        .map(|color| pack_obj_color(color, 1.0))
        .unwrap_or(0x000000ff);
    result.metallic = material.metallic.unwrap_or(0.0);
    result.roughness = material.roughness.unwrap_or(1.0);
    if material.dissolve < 1.0 || material.map_dissolve.is_some() {
        result.material3d_fields_mut().alpha_mode = MaterialAlphaMode::Blend;
    }
    if material.map_roughness.is_some() || material.map_metallic.is_some() {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            "mtl.metallic-roughness-map-unpacked",
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
            "objMaterialToStandardPbr",
            Some(HashMap::from([(
                "name".to_string(),
                ImportDiagnosticDetailValue::String(material.name.clone()),
            )])),
        );
    }
    return result;
}
