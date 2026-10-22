use flight_scene3d_formats::*;
use std::sync::Arc;

fn claimed_by(family: &[flight_entity::Ref<Awd2BlockHandler>]) -> Vec<u8> {
    let mut claimed: Vec<_> = family
        .iter()
        .flat_map(|handler| handler.read().unwrap().block_types.clone())
        .collect();
    claimed.sort();
    return claimed;
}

mod awd2_all_block_handlers {
    use super::*;

    #[test]
    fn claims_each_of_the_eleven_source_block_types_exactly_once() {
        assert_eq!(
            claimed_by(&AWD2_ALL_BLOCK_HANDLERS),
            [1, 22, 23, 41, 42, 51, 81, 82, 101, 102, 103]
        );
    }

    #[test]
    fn composes_and_contains_every_original_family_handle_in_source_build_order() {
        let expected: Vec<_> = AWD2_MATERIALS_FAMILY
            .iter()
            .chain(AWD2_SKELETON_FAMILY.iter())
            .chain(AWD2_GEOMETRY_FAMILY.iter())
            .chain(AWD2_SCENE_STRUCTURE_FAMILY.iter())
            .chain(AWD2_LIGHTING_FAMILY.iter())
            .chain(AWD2_CAMERA_FAMILY.iter())
            .collect();
        assert_eq!(expected.len(), AWD2_ALL_BLOCK_HANDLERS.len());
        for (expected, actual) in expected.iter().zip(AWD2_ALL_BLOCK_HANDLERS.iter()) {
            assert!(Arc::ptr_eq(expected, actual));
        }
        for family in [
            &*AWD2_CAMERA_FAMILY,
            &*AWD2_GEOMETRY_FAMILY,
            &*AWD2_LIGHTING_FAMILY,
            &*AWD2_MATERIALS_FAMILY,
            &*AWD2_SCENE_STRUCTURE_FAMILY,
            &*AWD2_SKELETON_FAMILY,
        ] {
            for handler in family {
                assert!(
                    AWD2_ALL_BLOCK_HANDLERS
                        .iter()
                        .any(|actual| Arc::ptr_eq(actual, handler))
                );
            }
        }
    }
}

mod awd2_camera_family {
    use super::*;
    #[test]
    fn claims_only_cameras() {
        assert_eq!(claimed_by(&AWD2_CAMERA_FAMILY), [AWD2_BLOCK_CAMERA]);
    }
}

mod awd2_geometry_family {
    use super::*;
    #[test]
    fn claims_only_triangle_geometry() {
        assert_eq!(
            claimed_by(&AWD2_GEOMETRY_FAMILY),
            [AWD2_BLOCK_TRIANGLE_GEOMETRY]
        );
    }
}

mod awd2_lighting_family {
    use super::*;
    #[test]
    fn claims_lights_and_pickers() {
        assert_eq!(
            claimed_by(&AWD2_LIGHTING_FAMILY),
            [AWD2_BLOCK_LIGHT, AWD2_BLOCK_LIGHT_PICKER]
        );
    }
}

mod awd2_materials_family {
    use super::*;
    #[test]
    fn claims_materials_and_textures() {
        assert_eq!(
            claimed_by(&AWD2_MATERIALS_FAMILY),
            [AWD2_BLOCK_MATERIAL, AWD2_BLOCK_TEXTURE]
        );
    }
}

mod awd2_scene_structure_family {
    use super::*;
    #[test]
    fn claims_containers_and_mesh_instances() {
        assert_eq!(
            claimed_by(&AWD2_SCENE_STRUCTURE_FAMILY),
            [AWD2_BLOCK_CONTAINER, AWD2_BLOCK_MESH_INSTANCE]
        );
    }
}

mod awd2_skeleton_family {
    use super::*;
    #[test]
    fn claims_skeletons_poses_and_animations() {
        assert_eq!(
            claimed_by(&AWD2_SKELETON_FAMILY),
            [
                AWD2_BLOCK_SKELETON,
                AWD2_BLOCK_SKELETON_POSE,
                AWD2_BLOCK_SKELETON_ANIMATION
            ]
        );
    }

    #[test]
    fn defers_exactly_the_pose_and_animation_handlers_and_keeps_the_skeleton_in_the_first_pass() {
        let deferred: Vec<_> = AWD2_SKELETON_FAMILY
            .iter()
            .filter(|handler| handler.read().unwrap().deferred == Some(true))
            .collect();
        assert_eq!(deferred.len(), 2);
        assert_eq!(
            AWD2_SKELETON_FAMILY
                .iter()
                .filter(|handler| handler.read().unwrap().deferred != Some(true))
                .count(),
            1
        );
        for handler in deferred {
            assert!(
                !handler
                    .read()
                    .unwrap()
                    .block_types
                    .contains(&AWD2_BLOCK_SKELETON)
            );
        }
    }
}
