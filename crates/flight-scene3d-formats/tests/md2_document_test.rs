use super::md2_test_helper::*;
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

fn animated_skinned_md2() -> Box<[u8]> {
    let mut f = triangle_fixture();
    f.num_frames = 2;
    f.skins = vec!["body.pcx".to_string()];
    f.frame_names = vec!["stand01".to_string(), "stand02".to_string()];
    f.extra_frames = vec![vec![[1, 0, 0, 0], [2, 0, 0, 0], [1, 1, 0, 0]]];
    return build_md2(&f);
}

fn animation_values(document: &Scene3DDocument) -> Vec<(Option<String>, f32, Vec<f32>, Vec<f32>)> {
    return document
        .animations
        .iter()
        .map(|clip| {
            let track = clip.channels[0].track.read().unwrap();
            return (
                clip.name.clone(),
                clip.duration,
                track.times.clone(),
                track.values.clone(),
            );
        })
        .collect();
}

fn material_names(document: &Scene3DDocument) -> Vec<Option<String>> {
    return document
        .materials
        .iter()
        .map(|material| {
            let Scene3DDocumentMaterial::Entity(material) = material else {
                panic!("entity");
            };
            return material
                .material
                .read()
                .unwrap()
                .material_fields()
                .name
                .clone();
        })
        .collect();
}

mod create_scene3d_from_md2 {
    use super::*;
    #[test]
    fn assembles_live_scene_with_default_or_empty_family() {
        let bytes = animated_skinned_md2();
        let scene = create_scene3d_from_md2(&bytes, None, None);
        scene_geometry(&scene);
        assert_eq!(scene.animations.len(), 1);
        let scene = create_scene3d_from_md2(
            &bytes,
            None,
            Some(&Md2ImportOptions {
                section_handlers: Some(Vec::new()),
            }),
        );
        scene_geometry(&scene);
        assert!(scene.animations.is_empty());
    }
}

mod md2_all_section_handlers_tests {
    use super::*;
    #[test]
    fn contains_every_family_in_material_then_animation_order_without_duplicates() {
        assert_eq!(
            MD2_ALL_SECTION_HANDLERS.len(),
            MD2_SKIN_FAMILY.len() + MD2_ANIMATION_FAMILY.len()
        );
        assert!(Arc::ptr_eq(
            &MD2_ALL_SECTION_HANDLERS[0],
            &MD2_SKIN_FAMILY[0]
        ));
        assert!(Arc::ptr_eq(
            &MD2_ALL_SECTION_HANDLERS[1],
            &MD2_ANIMATION_FAMILY[0]
        ));
        assert_eq!(
            MD2_ALL_SECTION_HANDLERS
                .iter()
                .map(|handler| handler.read().unwrap().feature.clone())
                .collect::<Vec<_>>(),
            ["Material", "Animation"]
        );
    }
}

mod parse_md2 {
    use super::*;

    #[test]
    fn default_and_explicit_full_family_have_identical_output() {
        let bytes = animated_skinned_md2();
        let default = parse_md2(&bytes, None, None);
        let explicit = parse_md2(
            &bytes,
            None,
            Some(&Md2ImportOptions {
                section_handlers: Some(MD2_ALL_SECTION_HANDLERS.clone()),
            }),
        );
        assert_eq!(material_names(&default), material_names(&explicit));
        assert_eq!(animation_values(&default), animation_values(&explicit));
        assert_eq!(
            default.meshes[0].geometry.read().unwrap().vertices,
            explicit.meshes[0].geometry.read().unwrap().vertices
        );
        assert_eq!(
            geometry_indices(&default.meshes[0].geometry.read().unwrap()),
            geometry_indices(&explicit.meshes[0].geometry.read().unwrap())
        );
        assert_eq!(default.meshes[0].materials, explicit.meshes[0].materials);
        assert_eq!(default.materials.len(), 1);
        assert_eq!(default.animations.len(), 1);
        assert_eq!(default.meshes.len(), 1);
        assert_eq!(default.animations[0].channels[0].node, 0);
        assert!(default.meshes[0].morph.is_some());
    }

    #[test]
    fn empty_family_keeps_geometry_and_morph_without_optional_sections() {
        let document = parse_md2(
            &animated_skinned_md2(),
            None,
            Some(&Md2ImportOptions {
                section_handlers: Some(Vec::new()),
            }),
        );
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes.len(), 1);
        assert!(document.materials.is_empty());
        assert!(document.animations.is_empty());
        assert!(document.resources.is_empty());
        assert!(document.meshes[0].morph.is_some());
    }

    #[test]
    fn every_family_keeps_read_integrity_guards() {
        for handlers in [
            None,
            Some(MD2_ALL_SECTION_HANDLERS.clone()),
            Some(Vec::new()),
        ] {
            let mut diagnostics = Vec::new();
            let document = parse_md2(
                &[1, 2, 3],
                Some(&mut diagnostics),
                Some(&Md2ImportOptions {
                    section_handlers: handlers,
                }),
            );
            expect_empty_document(&document);
            expect_crumb(
                &diagnostics,
                "md2.header-too-short",
                ImportDiagnosticSeverity::Reject,
                "parseMd2",
                &[("byteLength", 3.0)],
            );
        }
    }

    #[test]
    fn open_custom_handlers_run_in_order_with_shared_context_before_mesh_assembly() {
        let seen = Arc::new(RwLock::new(Vec::new()));
        let first_seen = seen.clone();
        let second_seen = seen.clone();
        let first: Ref<Md2SectionHandler> = Arc::new(RwLock::new(Md2SectionHandler {
            feature: "Vendor.Custom".to_string(),
            collect: Arc::new(move |context| {
                assert!(context.document.meshes.is_empty());
                assert!(context.document.nodes.is_empty());
                assert!(context.morph.is_some());
                assert_eq!(context.frames.len(), 2);
                context.mesh_materials.push(17);
                context.document.scenes[0].name = Some("vendor".to_string());
                first_seen.write().unwrap().push(1);
            }),
        }));
        let second: Ref<Md2SectionHandler> = Arc::new(RwLock::new(Md2SectionHandler {
            feature: "Vendor.Custom".to_string(),
            collect: Arc::new(move |context| {
                assert_eq!(context.mesh_materials.as_slice(), [17]);
                assert_eq!(context.document.scenes[0].name.as_deref(), Some("vendor"));
                second_seen.write().unwrap().push(2);
            }),
        }));
        let options = Md2ImportOptions {
            section_handlers: Some(vec![first, second.clone(), second]),
        };
        let document = parse_md2(&animated_skinned_md2(), None, Some(&options));
        assert_eq!(*seen.read().unwrap(), [1, 2, 2]);
        assert_eq!(document.meshes[0].materials, [17]);
    }

    #[test]
    fn selective_families_remove_only_their_owned_sections() {
        let bytes = animated_skinned_md2();
        let full = parse_md2(&bytes, None, None);
        let no_skin = parse_md2(
            &bytes,
            None,
            Some(&Md2ImportOptions {
                section_handlers: Some(MD2_ANIMATION_FAMILY.clone()),
            }),
        );
        assert!(no_skin.materials.is_empty());
        assert!(no_skin.resources.is_empty());
        assert_eq!(animation_values(&full), animation_values(&no_skin));
        assert_eq!(
            full.meshes[0].geometry.read().unwrap().vertices,
            no_skin.meshes[0].geometry.read().unwrap().vertices
        );
        let no_animation = parse_md2(
            &bytes,
            None,
            Some(&Md2ImportOptions {
                section_handlers: Some(MD2_SKIN_FAMILY.clone()),
            }),
        );
        assert!(no_animation.animations.is_empty());
        assert_eq!(material_names(&full), material_names(&no_animation));
        assert_eq!(full.meshes[0].materials, no_animation.meshes[0].materials);
        assert_eq!(
            full.meshes[0].geometry.read().unwrap().vertices,
            no_animation.meshes[0].geometry.read().unwrap().vertices
        );
        let full_morph = full.meshes[0].morph.as_ref().unwrap().read().unwrap();
        let partial_morph = no_animation.meshes[0]
            .morph
            .as_ref()
            .unwrap()
            .read()
            .unwrap();
        assert_eq!(
            full_morph.targets[0].position_deltas,
            partial_morph.targets[0].position_deltas
        );
    }
}
