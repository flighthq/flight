use super::md5_test_helper::*;
use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_materials::{BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{
    Node3DRef, Scene3D, Scene3DAnimationTarget, Scene3DDocument, Scene3DDocumentMaterial,
    as_node3d_ref,
};
use flight_scene3d_formats::contract::get_test_texture_resource;
use flight_scene3d_formats::*;
use std::sync::Arc;

fn first_mesh(scene: &Scene3D) -> Node3DRef {
    return {
        let mut output = Vec::new();
        get_node_children(&mut output, &(scene.root.clone() as NodeRef));
        output
    }
    .iter()
    .filter_map(as_node3d_ref)
    .find(|node| node.read().unwrap().as_mesh().is_some())
    .unwrap();
}

fn material_names(document: &Scene3DDocument) -> Vec<Option<String>> {
    return document
        .materials
        .iter()
        .map(|entry| {
            let Scene3DDocumentMaterial::Entity(entry) = entry else {
                panic!("entity");
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
}

mod create_scene3d_from_md5_mesh {
    use super::*;

    #[test]
    fn assembles_live_hierarchy_skin_and_shader_resource_with_original_joint_handles() {
        let scene = create_scene3d_from_md5_mesh(MULTI_JOINT_HIERARCHY, None, None);
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &(scene.root.clone() as NodeRef));
            output
        };
        assert_eq!(children.len(), 2);
        assert_eq!(
            children[0].read().unwrap().node_fields().name.as_deref(),
            Some("skeleton")
        );
        let root = {
            let mut output = Vec::new();
            get_node_children(&mut output, &children[0]);
            output
        };
        assert_eq!(root.len(), 1);
        assert_eq!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &root[0]);
                output
            }
            .len(),
            2
        );
        let mesh = first_mesh(&scene);
        let mesh_guard = mesh.read().unwrap();
        let mesh = mesh_guard.as_mesh().unwrap();
        let skin = mesh.skin.as_ref().unwrap().read().unwrap();
        assert!(skin.skeleton_root.is_none());
        let skeleton = skin.skeleton.read().unwrap();
        assert_eq!(
            skeleton.names.as_deref(),
            Some(
                [
                    "root".to_string(),
                    "child_a".to_string(),
                    "child_b".to_string()
                ]
                .as_slice()
            )
        );
        let found = find_scene3d_skeleton_joints(&scene.root).unwrap();
        assert!(Arc::ptr_eq(&found, &skeleton.joints));
        let first_joint = as_node3d_ref(&root[0]).unwrap();
        assert!(Arc::ptr_eq(&found.read().unwrap()[0], &first_joint));
        let materials = mesh.materials.read().unwrap();
        let material = materials[0].as_ref().unwrap().read().unwrap();
        assert_eq!(material.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(
            material.material_fields().name.as_deref(),
            Some("textures/body")
        );
        let material = material
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap();
        let texture = material.diffuse_map.as_ref().unwrap();
        assert!(flight_texture::get_texture_source(&*texture.read().unwrap()).is_none());
        let resource = get_test_texture_resource(&scene.resources, texture);
        let flight_image::ImageResourceReference::External(resource) = resource else {
            panic!("external");
        };
        assert_eq!(resource.reference.read().unwrap().uri, "textures/body");
        assert!(scene.animations.is_empty());
    }

    #[test]
    fn forwards_options_and_handles_multiple_sections_empty_and_comment_only_inputs() {
        for source in ["", "// just a comment\n"] {
            let scene = create_scene3d_from_md5_mesh(source, None, None);
            assert!(
                {
                    let mut output = Vec::new();
                    get_node_children(&mut output, &(scene.root as NodeRef));
                    output
                }
                .is_empty()
            );
        }
        let mesh_block = SINGLE_TRIANGLE.split_once("mesh {").unwrap().1;
        let source = format!("{SINGLE_TRIANGLE}\nmesh {{{mesh_block}");
        let scene = create_scene3d_from_md5_mesh(&source, None, None);
        assert_eq!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(scene.root as NodeRef));
                output
            }
            .len(),
            3
        );
        let options = Md5ImportOptions {
            section_handlers: Some(Vec::new()),
        };
        let scene = create_scene3d_from_md5_mesh(SINGLE_TRIANGLE, None, Some(&options));
        assert_eq!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(scene.root.clone() as NodeRef));
                output
            }
            .len(),
            1
        );
        let mesh = first_mesh(&scene);
        let mesh = mesh.read().unwrap();
        let mesh = mesh.as_mesh().unwrap();
        assert!(mesh.materials.read().unwrap().is_empty());
        assert!(mesh.skin.is_none());
    }
}

mod import_md5_mesh {
    use super::*;

    #[test]
    fn composes_a_default_clip_or_named_clip_bound_to_the_mesh_skeleton_original_nodes() {
        let scene = import_md5_mesh(SINGLE_TRIANGLE, Some(SINGLE_JOINT_ANIM), None, None);
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.get("default").unwrap().read().unwrap();
        let target = clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        let mesh = first_mesh(&scene);
        let mesh = mesh.read().unwrap();
        let skin = mesh
            .as_mesh()
            .unwrap()
            .skin
            .as_ref()
            .unwrap()
            .read()
            .unwrap();
        assert!(Arc::ptr_eq(
            &target.node,
            &skin.skeleton.read().unwrap().joints.read().unwrap()[0]
        ));
        let mut scene = create_scene3d_from_md5_mesh(SINGLE_TRIANGLE, None, None);
        let joints = find_scene3d_skeleton_joints(&scene.root).unwrap();
        let walk = parse_md5_anim(SINGLE_JOINT_ANIM, &joints.read().unwrap(), None).unwrap();
        scene.animations.insert("walk".to_string(), walk.clone());
        assert!(Arc::ptr_eq(&scene.animations["walk"], &walk));
        assert!(Arc::ptr_eq(
            &walk.read().unwrap().channels[0]
                .target_ref
                .as_ref()
                .unwrap()
                .downcast_ref::<Scene3DAnimationTarget>()
                .unwrap()
                .node,
            &joints.read().unwrap()[0]
        ));
    }

    #[test]
    fn omission_imports_mesh_only_and_missing_or_omitted_skeleton_drops_the_animation() {
        let scene = import_md5_mesh(SINGLE_TRIANGLE, None, None, None);
        assert!(scene.animations.is_empty());
        assert_eq!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(scene.root as NodeRef));
                output
            }
            .len(),
            2
        );
        for (source, handlers) in [
            (JOINTLESS_MESH, None),
            (SINGLE_TRIANGLE, Some(MD5_MATERIAL_FAMILY.clone())),
        ] {
            let mut diagnostics = Vec::new();
            let scene = import_md5_mesh(
                source,
                Some(SINGLE_JOINT_ANIM),
                Some(&mut diagnostics),
                Some(&Md5ImportOptions {
                    section_handlers: handlers,
                }),
            );
            assert!(scene.animations.is_empty());
            let crumb = diagnostics
                .iter()
                .find(|value| value.kind == "md5mesh.animation-no-skeleton")
                .unwrap();
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "importMd5Mesh");
            assert!(crumb.detail.is_none());
        }
        let scene = import_md5_mesh(
            SINGLE_TRIANGLE,
            None,
            None,
            Some(&Md5ImportOptions {
                section_handlers: Some(MD5_SKELETON_FAMILY.clone()),
            }),
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(scene.root as NodeRef));
                output
            }
            .len(),
            2
        );
    }
    #[test]
    fn constructs_fresh_scenes_without_mutating_retained_prior_animation_targets_or_entity_runtime()
    {
        let mut first = import_md5_mesh(SINGLE_TRIANGLE, Some(SINGLE_JOINT_ANIM), None, None);
        let first_uid = flight_entity::get_entity_uid(&mut first);
        let first_root = first.root.clone();
        let first_resource_pointer = first.resources.as_ptr();
        let first_resource_count = first.resources.len();
        let clip = first.animations["default"].clone();
        let target = clip.read().unwrap().channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap()
            .node
            .clone();
        let mut second = import_md5_mesh("", None, None, None);
        assert_ne!(flight_entity::get_entity_uid(&mut second), first_uid);
        assert_eq!(flight_entity::get_entity_uid(&mut first), first_uid);
        assert!(!Arc::ptr_eq(&second.root, &first_root));
        assert!(second.animations.is_empty());
        assert!(second.resources.is_empty());
        assert!(second.metadata.is_none());
        assert!(Arc::ptr_eq(&first.root, &first_root));
        assert!(Arc::ptr_eq(&first.animations["default"], &clip));
        assert_eq!(first.resources.as_ptr(), first_resource_pointer);
        assert_eq!(first.resources.len(), first_resource_count);
        assert!(Arc::ptr_eq(
            &clip.read().unwrap().channels[0]
                .target_ref
                .as_ref()
                .unwrap()
                .downcast_ref::<Scene3DAnimationTarget>()
                .unwrap()
                .node,
            &target
        ));
        assert!(
            !{
                let mut output = Vec::new();
                get_node_children(&mut output, &(first_root as NodeRef));
                output
            }
            .is_empty()
        );
    }
}

mod parse_md5_mesh {
    use super::*;

    #[test]
    fn default_and_explicit_full_family_emit_the_same_document_values() {
        let default = parse_md5_mesh(SINGLE_TRIANGLE, None, None);
        let explicit = parse_md5_mesh(
            SINGLE_TRIANGLE,
            None,
            Some(&Md5ImportOptions {
                section_handlers: Some(MD5_ALL_SECTION_HANDLERS.clone()),
            }),
        );
        assert_eq!(material_names(&default), material_names(&explicit));
        assert_eq!(default.meshes[0].materials, explicit.meshes[0].materials);
        assert_eq!(default.meshes[0].skin, explicit.meshes[0].skin);
        assert_eq!(default.skins[0].joints, explicit.skins[0].joints);
        assert_eq!(
            default.skins[0].inverse_bind,
            explicit.skins[0].inverse_bind
        );
        assert_eq!(
            default.meshes[0].geometry.read().unwrap().vertices,
            explicit.meshes[0].geometry.read().unwrap().vertices
        );
        assert_eq!(default.meshes.len(), 1);
        assert_eq!(default.skins.len(), 1);
        assert_eq!(default.materials.len(), 1);
        assert!(default.animations.is_empty());
    }

    #[test]
    fn selectively_omitting_a_handler_removes_only_its_owned_feature() {
        let full = parse_md5_mesh(SINGLE_TRIANGLE, None, None);
        for handlers in [
            Vec::new(),
            MD5_SKELETON_FAMILY.clone(),
            MD5_MATERIAL_FAMILY.clone(),
        ] {
            let skeleton = handlers
                .iter()
                .any(|handler| Arc::ptr_eq(handler, &MD5_SKELETON_HANDLER));
            let material = handlers
                .iter()
                .any(|handler| Arc::ptr_eq(handler, &MD5_MATERIAL_HANDLER));
            let partial = parse_md5_mesh(
                SINGLE_TRIANGLE,
                None,
                Some(&Md5ImportOptions {
                    section_handlers: Some(handlers),
                }),
            );
            assert_eq!(partial.meshes.len(), 1);
            assert_eq!(partial.skins.len(), usize::from(skeleton));
            assert_eq!(partial.materials.len(), usize::from(material));
            assert_eq!(partial.resources.len(), usize::from(material));
            assert_eq!(partial.nodes.len(), if skeleton { 3 } else { 1 });
            assert_eq!(
                partial.meshes[0].skin,
                if skeleton { Some(0) } else { None }
            );
            assert_eq!(
                partial.meshes[0].geometry.read().unwrap().vertices,
                full.meshes[0].geometry.read().unwrap().vertices
            );
            if skeleton {
                assert_eq!(partial.skins[0].inverse_bind, full.skins[0].inverse_bind);
            }
            if material {
                assert_eq!(material_names(&partial), material_names(&full));
            }
        }
    }

    #[test]
    fn read_integrity_guards_are_kept_for_every_family() {
        for handlers in [
            None,
            Some(MD5_ALL_SECTION_HANDLERS.clone()),
            Some(Vec::new()),
        ] {
            let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
            parse_md5_mesh(
                "not an md5 file",
                Some(&mut diagnostics),
                Some(&Md5ImportOptions {
                    section_handlers: handlers,
                }),
            );
            assert!(
                diagnostics
                    .iter()
                    .any(|value| value.kind == "md5mesh.no-data")
            );
        }
    }
}
