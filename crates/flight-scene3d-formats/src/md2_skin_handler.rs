use crate::md2_parse::{md2_numeric_detail, read_md2_name};
use crate::md2_schema::MD2_SKIN_SIZE;
use crate::md2_types::{Md2ParseContext, Md2SectionHandler};
use crate::shared::create_external_texture_ref;
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticSeverity, report_import_diagnostic};
use flight_materials::contract::{Material, Material3D, create_blinn_phong_material};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use std::sync::{Arc, LazyLock, RwLock};

pub static MD2_SKIN_HANDLER: LazyLock<Ref<Md2SectionHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Md2SectionHandler {
        feature: "Material".to_string(),
        collect: Arc::new(collect_md2_skin),
    }))
});
pub static MD2_SKIN_FAMILY: LazyLock<Vec<Ref<Md2SectionHandler>>> =
    LazyLock::new(|| vec![MD2_SKIN_HANDLER.clone()]);

fn collect_md2_skin(context: &mut Md2ParseContext<'_>) {
    let mut empty_skin_count = 0;
    let mut first_empty_skin = 0;
    for s in 0..context.num_skins {
        let skin_offset = context.off_skins + s * MD2_SKIN_SIZE;
        if skin_offset + MD2_SKIN_SIZE > context.bytes.len() {
            report_import_diagnostic(
                context.diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "md2.skin-record-truncated",
                "parseMd2",
                md2_numeric_detail(&[("skin", s as f32)]),
            );
            break;
        }
        let skin_name = read_md2_name(context.bytes, skin_offset, MD2_SKIN_SIZE);
        if skin_name.is_empty() {
            if empty_skin_count == 0 {
                first_empty_skin = s;
            }
            empty_skin_count += 1;
            continue;
        }
        let texture =
            create_external_texture_ref(&skin_name, None, Some(&mut context.document.resources));
        let mut material = create_blinn_phong_material();
        material.diffuse_map = Some(texture);
        material.material_fields_mut().name = Some(skin_name);
        let index = context.document.materials.len() as i32;
        let material: Ref<dyn Material3D> = Arc::new(RwLock::new(material));
        context
            .document
            .materials
            .push(Scene3DDocumentMaterial::Entity(
                Scene3DDocumentMaterialEntity { material },
            ));
        if context.mesh_materials.is_empty() {
            context.mesh_materials.push(index);
        }
    }
    if empty_skin_count > 0 {
        report_import_diagnostic(
            context.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Drop,
            "md2.skin-empty-path",
            "parseMd2",
            md2_numeric_detail(&[
                ("count", empty_skin_count as f32),
                ("firstSkin", first_empty_skin as f32),
            ]),
        );
    }
}
