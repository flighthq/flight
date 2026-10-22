use super::md2_test_helper::*;
use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_materials::{BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial};
use flight_node::{NodeRef, get_node_children};
use flight_resource::ResourceResolutionState;
use flight_scene3d::{Mesh, Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::contract::get_test_texture_resource;
use flight_scene3d_formats::*;
use flight_texture::{Texture, get_texture_source};
use std::sync::Arc;

fn diffuse_texture(document: &Scene3DDocument, index: usize) -> Ref<Texture> {
    let Scene3DDocumentMaterial::Entity(entry) = &document.materials[index] else {
        panic!("expected entity material");
    };
    let material = entry.material.read().unwrap();
    let blinn = material
        .as_any()
        .downcast_ref::<BlinnPhongMaterial>()
        .unwrap();
    return blinn.diffuse_map.clone().unwrap();
}

mod md2_skin_handler_tests {
    use super::*;

    #[test]
    fn authored_skin_reaches_live_mesh_with_original_resource_subscription() {
        let mut f = triangle_fixture();
        f.skins = vec!["players/hero/skin.pcx".to_string()];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let root: NodeRef = scene.root.clone();
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &root);
            output
        };
        let child = children[0].read().unwrap();
        let mesh = child.as_any().downcast_ref::<Mesh>().unwrap();
        let materials = mesh.materials.read().unwrap();
        assert_eq!(materials.len(), 1);
        let material = materials[0].as_ref().unwrap().read().unwrap();
        assert_eq!(material.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(
            material.material_fields().name.as_deref(),
            Some("players/hero/skin.pcx")
        );
        let texture = material
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap()
            .diffuse_map
            .as_ref()
            .unwrap();
        let ImageResourceReference::External(resource) =
            get_test_texture_resource(&scene.resources, texture)
        else {
            panic!("external skin");
        };
        assert_eq!(
            resource.reference.read().unwrap().uri,
            "players/hero/skin.pcx"
        );
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());
    }
    #[test]
    fn empty_skin_paths_aggregate_once_and_first_nonempty_material_is_bound() {
        let mut f = triangle_fixture();
        f.skins = vec!["".to_string(), "".to_string(), "real.pcx".to_string()];
        let mut diagnostics = Vec::new();
        let document = parse_md2(&build_md2(&f), Some(&mut diagnostics), None);
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.meshes[0].materials, [0]);
        expect_crumb(
            &diagnostics,
            "md2.skin-empty-path",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("count", 2.0), ("firstSkin", 0.0)],
        );
        let mut f = triangle_fixture();
        f.skins = vec!["".to_string(), "".to_string()];
        diagnostics.clear();
        let scene = create_scene3d_from_md2(&build_md2(&f), Some(&mut diagnostics), None);
        scene_geometry(&scene);
        expect_crumb(
            &diagnostics,
            "md2.skin-empty-path",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("count", 2.0), ("firstSkin", 0.0)],
        );
    }

    #[test]
    fn family_covers_material_and_retains_exact_handler() {
        assert_eq!(MD2_SKIN_FAMILY.len(), 1);
        assert_eq!(MD2_SKIN_HANDLER.read().unwrap().feature, "Material");
        assert!(Arc::ptr_eq(&MD2_SKIN_FAMILY[0], &MD2_SKIN_HANDLER));
    }

    #[test]
    fn materials_retain_authored_names_and_unresolved_texture_resource_identity() {
        let mut f = triangle_fixture();
        f.skins = vec![
            "skins/red.pcx".to_string(),
            "skins/blue.pcx".to_string(),
            "skins/green.pcx".to_string(),
        ];
        let document = parse_md2(&build_md2(&f), None, None);
        assert_eq!(document.materials.len(), 3);
        assert_eq!(document.resources.len(), 3);
        assert_eq!(document.meshes[0].materials, [0]);
        for (index, skin) in f.skins.iter().enumerate() {
            let Scene3DDocumentMaterial::Entity(entry) = &document.materials[index] else {
                panic!("material entity");
            };
            let material = entry.material.read().unwrap();
            assert_eq!(material.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
            assert_eq!(material.material_fields().name.as_ref(), Some(skin));
            drop(material);
            let texture = diffuse_texture(&document, index);
            assert!(get_texture_source(&*texture.read().unwrap()).is_none());
            let ImageResourceReference::External(found) =
                get_test_texture_resource(&document.resources, &texture)
            else {
                panic!("external skin");
            };
            let ImageResourceReference::External(expected) = &document.resources[index] else {
                panic!("external skin");
            };
            assert!(Arc::ptr_eq(&found.reference, &expected.reference));
            let resource = found.reference.read().unwrap();
            assert_eq!(resource.uri, *skin);
            assert_eq!(resource.base_path, None);
            assert_eq!(resource.state, ResourceResolutionState::Unresolved);
            assert!(Arc::ptr_eq(&resource.textures[0], &texture));
        }
    }

    #[test]
    fn no_skins_leave_live_mesh_unmaterialed() {
        let scene = create_scene3d_from_md2(&build_md2(&triangle_fixture()), None, None);
        let root: NodeRef = scene.root.clone();
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &root);
            output
        };
        let child = children[0].read().unwrap();
        let mesh = child.as_any().downcast_ref::<Mesh>().unwrap();
        assert!(mesh.materials.read().unwrap().is_empty());
    }

    #[test]
    fn standalone_handler_reads_only_skin_records_and_reports_truncation() {
        let mut bytes = vec![0; MD2_SKIN_SIZE];
        bytes[..8].copy_from_slice(b"body.pcx");
        let mut document = parse_md2(&[], None, None);
        let mut materials = Vec::new();
        let mut diagnostics = Vec::new();
        let mut context = Md2ParseContext {
            bytes: &bytes,
            diagnostics: Some(&mut diagnostics),
            document: &mut document,
            frames: &[],
            mesh_materials: &mut materials,
            morph: None,
            num_skins: 2,
            off_skins: 0,
        };
        let collect = MD2_SKIN_HANDLER.read().unwrap().collect.clone();
        collect(&mut context);
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.resources.len(), 1);
        assert_eq!(materials, [0]);
        expect_crumb(
            &diagnostics,
            "md2.skin-record-truncated",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("skin", 1.0)],
        );
    }

    #[test]
    fn truncated_optional_skin_preserves_geometry_and_reports_drop() {
        let mut f = triangle_fixture();
        f.skins = vec!["players/hero.pcx".to_string()];
        let mut bytes = build_md2(&f);
        let offset = bytes.len() as i32 - 10;
        write_i32(&mut bytes, 44, offset);
        let mut diagnostics = Vec::new();
        let scene = create_scene3d_from_md2(&bytes, Some(&mut diagnostics), None);
        scene_geometry(&scene);
        expect_crumb(
            &diagnostics,
            "md2.skin-record-truncated",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("skin", 0.0)],
        );
    }
}
