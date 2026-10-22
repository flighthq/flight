use super::md5_test_helper::*;
use flight_image::ImageResourceReference;
use flight_materials::{BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use std::sync::Arc;

mod md5_material_handler {
    use super::*;

    #[test]
    fn decodes_section_shader_as_named_blinn_phong_and_binds_same_texture_resource() {
        let mut document = empty_document();
        let mut materials = Vec::new();
        let mut context = Md5ParseContext {
            diagnostics: None,
            document: &mut document,
            drops: None,
            joints: &[],
            mesh: Some(Md5MeshSection {
                materials: &mut materials,
                shader: "textures/default",
            }),
            skin: None,
        };
        let collect = MD5_MATERIAL_HANDLER.read().unwrap().collect.clone();
        collect(&mut context);
        assert_eq!(document.materials.len(), 1);
        assert_eq!(materials, [0]);
        assert_eq!(document.resources.len(), 1);
        let Scene3DDocumentMaterial::Entity(entry) = &document.materials[0] else {
            panic!("material entity");
        };
        let material = entry.material.read().unwrap();
        assert_eq!(material.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(
            material.material_fields().name.as_deref(),
            Some("textures/default")
        );
        let texture = material
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap()
            .diffuse_map
            .as_ref()
            .unwrap();
        assert!(flight_texture::get_texture_source(&*texture.read().unwrap()).is_none());
        let ImageResourceReference::External(resource) = &document.resources[0] else {
            panic!("external shader");
        };
        let resource = resource.reference.read().unwrap();
        assert_eq!(resource.uri, "textures/default");
        assert!(Arc::ptr_eq(&resource.textures[0], texture));
    }

    #[test]
    fn each_mesh_section_gets_its_own_material_row_and_binding() {
        let mut document = empty_document();
        let mut first = Vec::new();
        let mut second = Vec::new();
        let collect = MD5_MATERIAL_HANDLER.read().unwrap().collect.clone();
        for (shader, materials) in [("a", &mut first), ("b", &mut second)] {
            let mut context = Md5ParseContext {
                diagnostics: None,
                document: &mut document,
                drops: None,
                joints: &[],
                mesh: Some(Md5MeshSection { materials, shader }),
                skin: None,
            };
            collect(&mut context);
        }
        let names: Vec<_> = document
            .materials
            .iter()
            .map(|entry| {
                let Scene3DDocumentMaterial::Entity(entry) = entry else {
                    panic!("material");
                };
                return entry
                    .material
                    .read()
                    .unwrap()
                    .material_fields()
                    .name
                    .clone();
            })
            .collect();
        assert_eq!(names, [Some("a".to_string()), Some("b".to_string())]);
        assert_eq!(first, [0]);
        assert_eq!(second, [1]);
    }

    #[test]
    fn family_and_handler_cover_material_by_exact_identity() {
        assert_eq!(MD5_MATERIAL_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(&MD5_MATERIAL_FAMILY[0], &MD5_MATERIAL_HANDLER));
        assert_eq!(
            MD5_MATERIAL_HANDLER.read().unwrap().feature,
            MD5_MATERIAL_FEATURE
        );
    }

    #[test]
    fn no_shader_or_no_mesh_emit_nothing() {
        let mut document = empty_document();
        let mut materials = Vec::new();
        let collect = MD5_MATERIAL_HANDLER.read().unwrap().collect.clone();
        let mut context = Md5ParseContext {
            diagnostics: None,
            document: &mut document,
            drops: None,
            joints: &[],
            mesh: Some(Md5MeshSection {
                materials: &mut materials,
                shader: "",
            }),
            skin: None,
        };
        collect(&mut context);
        assert!(context.document.materials.is_empty());
        assert!(context.mesh.as_ref().unwrap().materials.is_empty());
        context.mesh = None;
        collect(&mut context);
        assert!(context.document.materials.is_empty());
    }
}
