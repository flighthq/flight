use crate::support::*;
use flight_geometry::create_matrix4;
use flight_materials::contract::{Material3D, create_standard_pbr_material};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
mod create_scene3d_from_document {
    use super::*;
    #[test]
    fn resolves_malformed_joint_indices_before_sizing_palettes_without_remapping_inverse_bind_slots()
     {
        let mut doc = empty_document();
        doc.nodes = vec![
            document_node(None),
            document_node(None),
            document_node(None),
        ];
        doc.meshes.push(Scene3DDocumentMesh {
            geometry: test_geometry(),
            materials: Vec::new(),
            morph: None,
            skin: Some(0),
            name: None,
        });
        doc.nodes[0].mesh = Some(0);
        doc.nodes[1].mesh = Some(0);
        doc.skins.push(Scene3DDocumentSkin {
            joints: vec![-1, 2, 99],
            inverse_bind: vec![translation(7.0, 8.0, 9.0), translation(10.0, 11.0, 12.0)],
        });
        doc.scenes.push(Scene3DDocumentScene {
            name: None,
            root_nodes: vec![0, 1, 2],
        });
        let scene = create_scene3d_from_document(&doc, None);
        let roots = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scene.root.clone() as flight_node::NodeRef),
            );
            collected
        };
        let skin = |node: &NodeRef| {
            node.read()
                .unwrap()
                .as_any()
                .downcast_ref::<Mesh>()
                .unwrap()
                .skin
                .clone()
                .unwrap()
        };
        let first = skin(&roots[0]);
        assert!(Arc::ptr_eq(&first, &skin(&roots[1])));
        let skin = first.read().unwrap();
        let skeleton = skin.skeleton.read().unwrap();
        assert_eq!(skeleton.joints.read().unwrap().len(), 1);
        let joint: NodeRef = skeleton.joints.read().unwrap()[0].clone();
        assert!(Arc::ptr_eq(&joint, &roots[2]));
        assert!(skeleton.names.is_none());
        assert_eq!(skeleton.inverse_bind_matrices.read().unwrap().len(), 16);
        assert_eq!(
            &skeleton.inverse_bind_matrices.read().unwrap()[12..15],
            &[7.0, 8.0, 9.0]
        );
        assert_eq!(skeleton.joint_matrices.read().unwrap().as_ref(), &[0.0; 16]);
        assert_eq!(
            skeleton.normal_matrices.read().unwrap().as_ref(),
            &[0.0; 12]
        );
    }
    #[test]
    fn skips_invalid_animation_nodes_and_retains_fallback_names_and_declared_duration() {
        let mut doc = empty_document();
        doc.nodes.push(document_node(None));
        let track = test_track();
        doc.animations = vec![
            Scene3DDocumentAnimation {
                channels: vec![Scene3DDocumentAnimationChannel {
                    node: -1,
                    path: Scene3DAnimationPath::Translation,
                    track: track.clone(),
                }],
                duration: 4.0,
                name: None,
            },
            Scene3DDocumentAnimation {
                channels: vec![
                    Scene3DDocumentAnimationChannel {
                        node: 99,
                        path: Scene3DAnimationPath::Translation,
                        track: track.clone(),
                    },
                    Scene3DDocumentAnimationChannel {
                        node: 0,
                        path: Scene3DAnimationPath::Translation,
                        track: track.clone(),
                    },
                ],
                duration: 9.0,
                name: None,
            },
        ];
        let scene = create_scene3d_from_document(&doc, Some(-1));
        assert!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scene.root.clone() as flight_node::NodeRef),
                );
                collected
            }
            .is_empty()
        );
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.get("animation1").unwrap().read().unwrap();
        assert_eq!(clip.duration, 9.0);
        assert_eq!(clip.channels.len(), 1);
        assert!(Arc::ptr_eq(&clip.channels[0].track, &track));
    }
    #[test]
    fn yields_an_empty_scene_for_an_empty_document() {
        let scene = create_scene3d_from_document(&empty_document(), None);
        assert!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scene.root.clone() as flight_node::NodeRef),
                );
                collected
            }
            .is_empty()
        );
        assert!(scene.metadata.is_none());
    }
    #[test]
    fn resolves_original_material_entities_by_index_and_preserves_geometry_and_morph() {
        let material: flight_entity::Ref<dyn Material3D> =
            Arc::new(RwLock::new(create_standard_pbr_material()));
        let g = test_geometry();
        let morph = test_morph(vec![0.5]);
        let mut doc = empty_document();
        doc.materials.push(Scene3DDocumentMaterial::Entity(
            Scene3DDocumentMaterialEntity {
                material: material.clone(),
            },
        ));
        doc.meshes.push(Scene3DDocumentMesh {
            geometry: g.clone(),
            materials: vec![0, -1, 9],
            morph: Some(morph.clone()),
            skin: None,
            name: None,
        });
        let mut node = document_node(None);
        node.mesh = Some(0);
        node.kind = MESH_KIND.to_string();
        doc.nodes.push(node);
        doc.scenes.push(Scene3DDocumentScene {
            name: None,
            root_nodes: vec![0],
        });
        let scene = create_scene3d_from_document(&doc, None);
        let roots = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scene.root.clone() as flight_node::NodeRef),
            );
            collected
        };
        assert_eq!(roots.len(), 1);
        assert!(is_mesh(&Some(Arc::new(roots[0].clone()))));
        let guard = roots[0].read().unwrap();
        let mesh = guard.as_any().downcast_ref::<Mesh>().unwrap();
        assert!(Arc::ptr_eq(&mesh.geometry, &g));
        assert!(Arc::ptr_eq(mesh.morph.as_ref().unwrap(), &morph));
        let materials = mesh.materials.read().unwrap();
        assert!(Arc::ptr_eq(materials[0].as_ref().unwrap(), &material));
        assert!(materials[1].is_none());
        assert!(materials[2].is_none());
    }
    #[test]
    fn materializes_plain_document_fields_as_a_distinct_entity_with_3d_defaults() {
        let mut doc = empty_document();
        doc.materials.push(Scene3DDocumentMaterial::Fields(
            Scene3DDocumentMaterialFields {
                kind: "test.StructuralMaterial".to_string(),
                name: Some("structural".to_string()),
            },
        ));
        doc.meshes.push(Scene3DDocumentMesh {
            geometry: test_geometry(),
            materials: vec![0],
            morph: None,
            skin: None,
            name: None,
        });
        let mut node = document_node(None);
        node.mesh = Some(0);
        doc.nodes.push(node);
        doc.scenes.push(Scene3DDocumentScene {
            name: None,
            root_nodes: vec![0],
        });
        let scene = create_scene3d_from_document(&doc, None);
        let root = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scene.root.clone() as flight_node::NodeRef),
            );
            collected
        }
        .remove(0);
        let guard = root.read().unwrap();
        let m = guard
            .as_any()
            .downcast_ref::<Mesh>()
            .unwrap()
            .materials
            .read()
            .unwrap()[0]
            .clone()
            .unwrap();
        let mut m = m.write().unwrap();
        assert_eq!(m.material3d_fields().kind, "test.StructuralMaterial");
        assert_eq!(m.material3d_fields().name.as_deref(), Some("structural"));
        assert_eq!(m.material3d_fields().alpha_cutoff, 0.5);
        assert_eq!(
            m.material3d_fields().alpha_mode,
            flight_materials::MaterialAlphaMode::Opaque
        );
        assert!(!m.material3d_fields().double_sided);
        assert!(!flight_entity::get_entity_uid(m.material3d_fields_mut()).is_empty());
    }
    #[test]
    fn wires_children_applies_authored_trs_and_selects_the_requested_scene() {
        let mut doc = empty_document();
        let mut parent = document_node(Some("parent"));
        parent.children = vec![1, -1, 99];
        parent.transform.position.x = 5.0;
        doc.nodes = vec![
            parent,
            document_node(Some("child")),
            document_node(Some("b")),
        ];
        doc.scenes = vec![
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![0, -1, 99],
            },
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![2],
            },
        ];
        let scene = create_scene3d_from_document(&doc, None);
        let roots = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scene.root.clone() as flight_node::NodeRef),
            );
            collected
        };
        assert_eq!(roots.len(), 1);
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(&mut collected, &roots[0]);
                collected
            }
            .len(),
            1
        );
        let root = roots[0].read().unwrap();
        assert_eq!(
            root.as_any()
                .downcast_ref::<Node3DFields>()
                .unwrap()
                .position
                .x,
            5.0
        );
        drop(root);
        let scene = create_scene3d_from_document(&doc, Some(1));
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scene.root.clone() as flight_node::NodeRef),
                );
                collected
            }[0]
            .read()
            .unwrap()
            .node_fields()
            .name
            .as_deref(),
            Some("b")
        );
    }
    #[test]
    fn builds_the_actual_skeleton_entity_and_resolves_joint_and_skin_identity() {
        let mut doc = empty_document();
        doc.meshes.push(Scene3DDocumentMesh {
            geometry: test_geometry(),
            materials: Vec::new(),
            morph: None,
            skin: Some(0),
            name: None,
        });
        let mut mesh = document_node(None);
        mesh.kind = MESH_KIND.to_string();
        mesh.mesh = Some(0);
        mesh.children = vec![1];
        doc.nodes = vec![mesh, document_node(Some("joint"))];
        doc.skins.push(Scene3DDocumentSkin {
            inverse_bind: vec![create_matrix4()],
            joints: vec![1],
        });
        doc.scenes.push(Scene3DDocumentScene {
            name: None,
            root_nodes: vec![0],
        });
        let scene = create_scene3d_from_document(&doc, None);
        let mesh = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scene.root.clone() as flight_node::NodeRef),
            );
            collected
        }
        .remove(0);
        let joint = {
            let mut collected = Vec::new();
            get_node_children(&mut collected, &mesh);
            collected
        }
        .remove(0);
        let guard = mesh.read().unwrap();
        let skin = guard
            .as_any()
            .downcast_ref::<Mesh>()
            .unwrap()
            .skin
            .clone()
            .unwrap();
        let skin = skin.read().unwrap();
        assert!(skin.skeleton_root.is_none());
        let mut skeleton = skin.skeleton.write().unwrap();
        assert_eq!(skeleton.joints.read().unwrap().len(), 1);
        assert_eq!(skeleton.names, Some(vec!["joint".to_string()]));
        let erased: NodeRef = skeleton.joints.read().unwrap()[0].clone();
        assert!(Arc::ptr_eq(&erased, &joint));
        assert_eq!(skeleton.inverse_bind_matrices.read().unwrap().len(), 16);
        assert_eq!(skeleton.inverse_bind_matrices.read().unwrap()[0], 1.0);
        assert_eq!(skeleton.joint_matrices.read().unwrap().as_ref(), &[0.0; 16]);
        assert_eq!(
            skeleton.normal_matrices.read().unwrap().as_ref(),
            &[0.0; 12]
        );
        assert!(!flight_entity::get_entity_uid(&mut *skeleton).is_empty());
    }
    #[test]
    fn rebuilds_bound_animations_retaining_the_actual_track_entity() {
        let track = test_track();
        let mut doc = empty_document();
        doc.nodes.push(document_node(None));
        doc.scenes.push(Scene3DDocumentScene {
            name: None,
            root_nodes: vec![0],
        });
        doc.animations.push(Scene3DDocumentAnimation {
            channels: vec![Scene3DDocumentAnimationChannel {
                node: 0,
                path: Scene3DAnimationPath::Translation,
                track: track.clone(),
            }],
            duration: 1.0,
            name: Some("move".to_string()),
        });
        let scene = create_scene3d_from_document(&doc, None);
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.get("move").unwrap().read().unwrap();
        assert_eq!(clip.duration, 1.0);
        assert!(Arc::ptr_eq(&clip.channels[0].track, &track));
    }
}
mod create_scene3ds_from_document {
    use super::*;
    #[test]
    fn overlapping_scene_roots_reparent_the_same_node_pool_into_the_later_scene() {
        let mut doc = empty_document();
        doc.nodes.push(document_node(None));
        doc.scenes = vec![
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![0],
            },
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![0],
            },
        ];
        let scenes = create_scene3ds_from_document(&doc);
        assert!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scenes[0].root.clone() as flight_node::NodeRef),
                );
                collected
            }
            .is_empty()
        );
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scenes[1].root.clone() as flight_node::NodeRef),
                );
                collected
            }
            .len(),
            1
        );
    }
    #[test]
    fn builds_each_scene_from_one_node_pool_and_attaches_sidecars_only_to_the_first() {
        let mut doc = empty_document();
        doc.nodes = vec![document_node(None), document_node(None)];
        doc.scenes = vec![
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![0],
            },
            Scene3DDocumentScene {
                name: None,
                root_nodes: vec![1],
            },
        ];
        doc.animations.push(Scene3DDocumentAnimation {
            channels: vec![Scene3DDocumentAnimationChannel {
                node: 1,
                path: Scene3DAnimationPath::Translation,
                track: test_track(),
            }],
            duration: 1.0,
            name: Some("spin".to_string()),
        });
        let metadata = Arc::new(RwLock::new(Scene3DMetadata {
            copyright: None,
            generator: Some("tool".to_string()),
            version: None,
        }));
        doc.metadata = Some(metadata.clone());
        let scenes = create_scene3ds_from_document(&doc);
        assert_eq!(scenes.len(), 2);
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(
                    &mut collected,
                    &(scenes[0].root.clone() as flight_node::NodeRef),
                );
                collected
            }
            .len(),
            1
        );
        let second = {
            let mut collected = Vec::new();
            get_node_children(
                &mut collected,
                &(scenes[1].root.clone() as flight_node::NodeRef),
            );
            collected
        };
        assert_eq!(second.len(), 1);
        assert_eq!(scenes[0].animations.len(), 1);
        assert!(scenes[1].animations.is_empty());
        assert!(Arc::ptr_eq(scenes[0].metadata.as_ref().unwrap(), &metadata));
        assert!(scenes[1].metadata.is_none());
        let clip = scenes[0].animations.get("spin").unwrap().read().unwrap();
        let target = clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        let erased: NodeRef = target.node.clone();
        assert!(Arc::ptr_eq(&erased, &second[0]));
    }
    #[test]
    fn returns_no_scenes_for_a_sceneless_document() {
        assert!(create_scene3ds_from_document(&empty_document()).is_empty());
    }
}
