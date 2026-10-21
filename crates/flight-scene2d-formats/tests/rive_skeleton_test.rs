use std::sync::Arc;

use flight_scene2d_formats::contract::*;
use flight_skeleton2d::contract::create_skeleton_2d;

const ARTBOARD: u64 = 1;
const BONE: u64 = 40;
const LENGTH: u64 = 89;
const NAME: u64 = 4;
const NODE: u64 = 2;
const ROOT_BONE: u64 = 41;
const ROOT_X: u64 = 90;
const ROOT_Y: u64 = 91;
const ROTATION: u64 = 15;
const SCALE_X: u64 = 16;

mod create_rive_skeleton_2d {
    use super::*;

    #[test]
    fn returns_none_for_an_artboard_with_no_bones() {
        assert!(
            create_rive_skeleton_2d(&artboard(
                vec![object(ARTBOARD, &[], None), object(NODE, &[], None)],
                vec![-1, 0],
            ))
            .is_none()
        );
    }

    #[test]
    fn orders_every_bone_after_its_parent_even_when_the_stream_states_the_child_first() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(BONE, &[], Some("tip")),
                object(ROOT_BONE, &[], Some("root")),
            ],
            vec![-1, 2, 0],
        ))
        .unwrap();
        assert_eq!(bone_names(&result), ["root", "tip"]);
        assert_eq!(result.skeleton.bones[1].parent_index, 0);
        assert_eq!(result.skeleton.bones[0].parent_index, -1);
    }

    #[test]
    fn maps_each_artboard_component_index_to_its_bone_index_and_negative_one_for_everything_else() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(NODE, &[], None),
                object(ROOT_BONE, &[], Some("root")),
            ],
            vec![-1, 0, 0],
        ))
        .unwrap();
        assert_eq!(result.bone_indices, [-1, -1, 0]);
    }

    #[test]
    fn places_a_root_bone_at_the_position_it_states() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(ROOT_BONE, &[(ROOT_X, 12.0), (ROOT_Y, -5.0)], Some("root")),
            ],
            vec![-1, 0],
        ))
        .unwrap();
        assert_eq!(result.skeleton.bones[0].x, 12.0);
        assert_eq!(result.skeleton.bones[0].y, -5.0);
    }

    #[test]
    fn places_a_child_bone_at_its_parent_tip_rather_than_at_the_origin() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(ROOT_BONE, &[(LENGTH, 40.0)], Some("root")),
                object(BONE, &[(LENGTH, 25.0)], Some("child")),
            ],
            vec![-1, 0, 1],
        ))
        .unwrap();
        assert_eq!(result.skeleton.bones[1].x, 40.0);
        assert_eq!(result.skeleton.bones[1].y, 0.0);
        assert_eq!(result.skeleton.bones[1].length, 25.0);
    }

    #[test]
    fn converts_bone_rotation_from_radians_to_degrees() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(
                    ROOT_BONE,
                    &[(ROTATION, std::f32::consts::FRAC_PI_2)],
                    Some("root"),
                ),
            ],
            vec![-1, 0],
        ))
        .unwrap();
        assert!((result.skeleton.bones[0].rotation - 90.0).abs() < 1e-5);
    }

    #[test]
    fn defaults_an_unstated_scale_to_one_rather_than_zero() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(ROOT_BONE, &[(SCALE_X, 2.0)], Some("root")),
            ],
            vec![-1, 0],
        ))
        .unwrap();
        assert_eq!(result.skeleton.bones[0].scale_x, 2.0);
        assert_eq!(result.skeleton.bones[0].scale_y, 1.0);
    }

    #[test]
    fn sizes_the_skeleton_transform_buffers_to_the_bone_count() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(ROOT_BONE, &[], Some("root")),
                object(BONE, &[], Some("a")),
                object(BONE, &[], Some("b")),
            ],
            vec![-1, 0, 1, 2],
        ))
        .unwrap();
        assert_eq!(result.skeleton.bones.len(), 3);
        assert_eq!(result.skeleton.world_matrices.len(), 18);
        assert_eq!(result.skeleton.bone_matrices.len(), 18);
    }

    #[test]
    fn keeps_a_deep_chain_in_parent_before_child_order() {
        let result = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(BONE, &[], Some("c")),
                object(BONE, &[], Some("b")),
                object(ROOT_BONE, &[], Some("a")),
                object(BONE, &[], Some("d")),
            ],
            vec![-1, 2, 3, 0, 1],
        ))
        .unwrap();
        assert_eq!(bone_names(&result), ["a", "b", "c", "d"]);
        for (index, bone) in result.skeleton.bones.iter().enumerate() {
            assert!(bone.parent_index < index as i32);
        }
    }
}

mod initialize_rive_skeleton_2d_import {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_rive_skeleton_2d_import() {
        let mut out = create_rive_skeleton_2d(&artboard(
            vec![
                object(ARTBOARD, &[], None),
                object(ROOT_BONE, &[], Some("root")),
            ],
            vec![-1, 0],
        ))
        .unwrap();
        initialize_rive_skeleton_2d_import(
            &mut out,
            vec![-1, 0],
            create_skeleton_2d(Vec::new(), None),
        );
        assert_eq!(out.bone_indices, [-1, 0]);
    }
}

mod register_rive_skeleton_handlers {
    use super::*;

    #[test]
    fn claims_bones_skins_tendons_and_weights_with_one_handler() {
        let mut registry = create_rive_import_registry();
        register_rive_skeleton_handlers(&mut registry);
        let bone = get_rive_core_object_handler(&registry, BONE as i32).unwrap();
        for type_key in [ROOT_BONE as i32, 43, 46] {
            assert!(Arc::ptr_eq(
                &get_rive_core_object_handler(&registry, type_key).unwrap(),
                &bone,
            ));
        }
    }

    #[test]
    fn gives_a_bone_no_display_object_because_a_bone_is_a_transform_rather_than_a_node() {
        let mut registry = create_rive_import_registry();
        register_rive_skeleton_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, BONE as i32).unwrap();
        assert!(handler.apply_artboard.is_some());
    }
}

fn artboard(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    let stream_end = objects.len();
    return RiveArtboardGraph {
        objects,
        parent_indices,
        stream_end,
        stream_start: 0,
    };
}

fn bone_names(result: &RiveSkeleton2DImport) -> Vec<&str> {
    return result
        .skeleton
        .bones
        .iter()
        .map(|bone| bone.name.as_deref().unwrap_or(""))
        .collect();
}

fn object(type_key: u64, values: &[(u64, f32)], name: Option<&str>) -> RiveCoreObject {
    let mut properties = values
        .iter()
        .map(|(key, value)| RiveProperty {
            key: *key,
            r#type: RiveFieldType::Double,
            value: RiveValue::Double(*value),
        })
        .collect::<Vec<_>>();
    if let Some(name) = name {
        properties.push(RiveProperty {
            key: NAME,
            r#type: RiveFieldType::String,
            value: RiveValue::String(name.to_string()),
        });
    }
    return RiveCoreObject {
        properties,
        type_key,
    };
}
