use crate::gltf_test_helper::{
    minimal_gltf_document, optional_gltf_features, optional_gltf_features_glb,
};
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_entity::{Record, Unknown};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::Scene3D;
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod create_scene3d_from_glb {
    use super::*;

    #[test]
    fn resolves_the_preset_through_glb_so_animation_arrives_unregistered() {
        let scene = create_scene3d_from_glb(&optional_gltf_features_glb(), None, None);
        assert_eq!(scene.animations.len(), 1);
        assert!(scene.animations.contains_key("spin"));
    }

    #[test]
    fn returns_an_empty_scene_for_a_malformed_container_rather_than_throwing() {
        let scene = create_scene3d_from_glb(&malformed_glb(), None, None);
        assert!(root_names(&scene).is_empty());
    }
}

mod create_scene3d_from_gltf {
    use super::*;

    #[test]
    fn resolves_the_preset_that_the_selective_sibling_leaves_to_the_caller() {
        let source = optional_gltf_features();
        let input = GltfSource::Document(GltfDocumentSource { source: &source });
        assert!(
            parse_gltf_with_core_feature_handlers(&input, &[], None, None)
                .read()
                .unwrap()
                .cameras
                .is_empty()
        );
        let scene = create_scene3d_from_gltf(&input, None, None);
        assert_eq!(scene.animations.len(), 1);
        assert!(scene.animations.contains_key("spin"));
    }

    #[test]
    fn builds_the_files_default_scene_rather_than_scene_zero() {
        let source = optional_gltf_features();
        let scene = create_scene3d_from_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            None,
            None,
        );
        assert_eq!(root_names(&scene), ["b"]);
    }
}

mod create_scene3ds_from_glb {
    use super::*;

    #[test]
    fn builds_every_scene_declared_by_the_container() {
        let scenes = create_scene3ds_from_glb(&optional_gltf_features_glb(), None, None);
        assert_eq!(
            scenes.iter().map(root_names).collect::<Vec<_>>(),
            [vec!["a"], vec!["b"]]
        );
    }

    #[test]
    fn returns_an_empty_array_for_a_malformed_container() {
        assert!(create_scene3ds_from_glb(&malformed_glb(), None, None).is_empty());
    }
}

mod create_scene3ds_from_gltf {
    use super::*;

    #[test]
    fn builds_every_declared_scene() {
        let source = optional_gltf_features();
        let scenes = create_scene3ds_from_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            None,
            None,
        );
        assert_eq!(
            scenes.iter().map(root_names).collect::<Vec<_>>(),
            [vec!["a"], vec!["b"]]
        );
    }

    #[test]
    fn attaches_clips_to_scene_index_zero_even_when_the_default_scene_is_one() {
        let source = optional_gltf_features();
        let scenes = create_scene3ds_from_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            None,
            None,
        );
        assert_eq!(
            scenes
                .iter()
                .map(|scene| scene.animations.len())
                .collect::<Vec<_>>(),
            [1, 0]
        );
    }
}

mod parse_glb {
    use super::*;

    #[test]
    fn resolves_the_full_core_preset_for_glb_where_the_selective_sibling_resolves_none() {
        let document = parse_glb(&optional_gltf_features_glb(), None, None);
        let document = document.read().unwrap();
        assert_eq!(
            [
                document.animations.len(),
                document.cameras.len(),
                document.skins.len()
            ],
            [1, 1, 1]
        );
    }
}

mod parse_gltf {
    use super::*;

    #[test]
    fn resolves_animation_camera_and_skin_where_the_selective_parse_resolves_none() {
        let source = optional_gltf_features();
        let input = GltfSource::Document(GltfDocumentSource { source: &source });
        let selective = parse_gltf_with_core_feature_handlers(&input, &[], None, None);
        let selective = selective.read().unwrap();
        assert_eq!(
            [
                selective.animations.len(),
                selective.cameras.len(),
                selective.skins.len()
            ],
            [0, 0, 0]
        );
        let full = parse_gltf(&input, None, None);
        let full = full.read().unwrap();
        assert_eq!(
            [full.animations.len(), full.cameras.len(), full.skins.len()],
            [1, 1, 1]
        );
    }

    #[test]
    fn leaves_extension_reinterpretation_to_the_explicit_registrar_and_imports_the_base_material() {
        let source = minimal_gltf_document();
        let constructor: fn() -> Record<Unknown> = Default::default;
        source.write().unwrap().extensions_used = Some(vec!["KHR_materials_unlit".to_string()]);
        source.write().unwrap().materials = Some(vec![Arc::new(RwLock::new(GltfMaterial {
            name: None,
            pbr_metallic_roughness: None,
            normal_texture: None,
            occlusion_texture: None,
            emissive_texture: None,
            emissive_factor: None,
            alpha_mode: None,
            alpha_cutoff: None,
            double_sided: None,
            extensions: Some(Arc::new(RwLock::new(GltfMaterialExtensions {
                khr_materials_anisotropy: None,
                khr_materials_clearcoat: None,
                khr_materials_emissive_strength: None,
                khr_materials_ior: None,
                khr_materials_iridescence: None,
                khr_materials_pbr_specular_glossiness: None,
                khr_materials_sheen: None,
                khr_materials_unlit: Some(Arc::new(RwLock::new(GltfMaterialsUnlit {}))),
                khr_materials_specular: None,
                khr_materials_transmission: None,
                khr_materials_volume: None,
                vendor: constructor(),
            }))),
        }))]);
        source.write().unwrap().scenes = Some(vec![Arc::new(RwLock::new(GltfScene3D {
            name: None,
            nodes: Some(Vec::new()),
        }))]);
        let input = GltfSource::Document(GltfDocumentSource { source: &source });
        assert_eq!(
            parse_gltf(&input, None, None)
                .read()
                .unwrap()
                .materials
                .len(),
            1
        );
    }
}

fn malformed_glb() -> ArrayBufferView {
    let buffer = create_array_buffer_from_bytes(vec![1, 2, 3].into_boxed_slice());
    return create_array_buffer_view(&buffer, 0, 3, ArrayBufferViewKind::Uint8Array).unwrap();
}

fn root_names(scene: &Scene3D) -> Vec<String> {
    let root: NodeRef = scene.root.clone();
    let mut children = Vec::new();
    get_node_children(&mut children, &root);
    return children
        .iter()
        .map(|child| child.read().unwrap().node_fields().name.clone().unwrap())
        .collect();
}
