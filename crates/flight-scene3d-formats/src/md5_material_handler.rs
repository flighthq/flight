use crate::md5_types::{MD5_MATERIAL_FEATURE, Md5SectionHandler};
use crate::shared::create_external_texture_ref;
use flight_entity::Ref;
use flight_materials::contract::{Material, Material3D, create_blinn_phong_material};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use std::sync::{Arc, LazyLock, RwLock};

pub static MD5_MATERIAL_HANDLER: LazyLock<Ref<Md5SectionHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Md5SectionHandler {
        feature: MD5_MATERIAL_FEATURE.to_string(),
        collect: Arc::new(|context| {
            let Some(section) = context.mesh.as_mut() else {
                return;
            };
            if section.shader.is_empty() {
                return;
            }
            let texture = create_external_texture_ref(
                section.shader,
                None,
                Some(&mut context.document.resources),
            );
            let mut material = create_blinn_phong_material();
            material.diffuse_map = Some(texture);
            material.material_fields_mut().name = Some(section.shader.to_string());
            section
                .materials
                .push(context.document.materials.len() as i32);
            let material: Ref<dyn Material3D> = Arc::new(RwLock::new(material));
            context
                .document
                .materials
                .push(Scene3DDocumentMaterial::Entity(
                    Scene3DDocumentMaterialEntity { material },
                ));
        }),
    }))
});
pub static MD5_MATERIAL_FAMILY: LazyLock<Vec<Ref<Md5SectionHandler>>> =
    LazyLock::new(|| vec![MD5_MATERIAL_HANDLER.clone()]);
