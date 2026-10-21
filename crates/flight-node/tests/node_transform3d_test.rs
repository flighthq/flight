use flight_node::contract::*;

use crate::support::create_test_node_3d;

const CLOSE: f32 = 1e-3;

fn close(actual: f32, expected: f32) {
    assert!((actual - expected).abs() <= CLOSE, "{actual} != {expected}");
}

fn edit(node: &NodeRef, apply: impl FnOnce(Transform3DMut<'_>)) {
    {
        let mut guard = node.write().unwrap();
        let transform = guard
            .as_transform3d_node_mut()
            .expect("test node is a Transform3D node");
        apply(transform.transform3d_mut());
    }
    invalidate_node_local_transform(node);
}

fn set_translation(node: &NodeRef, x: f32, y: f32, z: f32) {
    edit(node, |transform| {
        transform.position.x = x;
        transform.position.y = y;
        transform.position.z = z;
    });
}

fn set_rotation_z(node: &NodeRef, radians: f32) {
    edit(node, |transform| {
        flight_geometry::set_quaternion_from_axis_angle(
            transform.rotation,
            &flight_geometry::create_vector3(0.0, 0.0, 1.0),
            radians,
        );
    });
}

fn set_scale(node: &NodeRef, x: f32, y: f32, z: f32) {
    edit(node, |transform| {
        transform.scale.x = x;
        transform.scale.y = y;
        transform.scale.z = z;
    });
}

fn translation_matrix(x: f32, y: f32, z: f32) -> flight_geometry::Matrix4 {
    let mut matrix = flight_geometry::create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    matrix.m[12] = x;
    matrix.m[13] = y;
    matrix.m[14] = z;
    return matrix;
}

fn cached_world_matrix(node: &NodeRef) -> Option<flight_geometry::Matrix4> {
    let guard = node.read().unwrap();
    return guard
        .as_transform3d_node()
        .unwrap()
        .transform3d_runtime()
        .world_matrix4
        .clone();
}

fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

mod convert_node_vector3_global_to_local {
    use super::*;

    #[test]
    fn returns_the_point_unchanged_for_an_identity_root() {
        let node = create_test_node_3d("Test");
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        convert_node_vector3_global_to_local(
            &mut out,
            &node,
            &flight_geometry::create_vector3(4.0, 5.0, 6.0),
            &mut revisions(),
        );
        close(out.x, 4.0);
        close(out.y, 5.0);
        close(out.z, 6.0);
    }

    #[test]
    fn inverts_the_node_translation() {
        let node = create_test_node_3d("Test");
        set_translation(&node, 10.0, 20.0, 30.0);
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        convert_node_vector3_global_to_local(
            &mut out,
            &node,
            &flight_geometry::create_vector3(11.0, 21.0, 31.0),
            &mut revisions(),
        );
        close(out.x, 1.0);
        close(out.y, 1.0);
        close(out.z, 1.0);
    }
}

mod convert_node_vector3_local_to_global {
    use super::*;

    #[test]
    fn applies_the_node_translation_to_a_local_point() {
        let node = create_test_node_3d("Test");
        set_translation(&node, 10.0, 20.0, 30.0);
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        convert_node_vector3_local_to_global(
            &mut out,
            &node,
            &flight_geometry::create_vector3(1.0, 1.0, 1.0),
            &mut revisions(),
        );
        close(out.x, 11.0);
        close(out.y, 21.0);
        close(out.z, 31.0);
    }

    #[test]
    fn applies_the_node_and_parent_translations() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_translation(&parent, 5.0, 0.0, 0.0);
        set_translation(&child, 3.0, 0.0, 0.0);
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        convert_node_vector3_local_to_global(
            &mut out,
            &child,
            &flight_geometry::create_vector3(0.0, 0.0, 0.0),
            &mut revisions(),
        );
        close(out.x, 8.0);
    }
}

mod ensure_node_local_matrix4 {
    use super::*;

    #[test]
    fn composes_the_local_matrix_from_translation_and_scale() {
        let node = create_test_node_3d("Test");
        edit(&node, |transform| {
            transform.position.x = 2.0;
            transform.position.y = 3.0;
            transform.position.z = 4.0;
            transform.scale.x = 5.0;
        });
        ensure_node_local_matrix4(&node);
        let matrix = get_node_local_matrix4(&node);
        close(matrix.m[0], 5.0);
        close(matrix.m[12], 2.0);
        close(matrix.m[13], 3.0);
        close(matrix.m[14], 4.0);
    }
}

mod ensure_node_world_matrix4 {
    use super::*;

    #[test]
    fn computes_the_world_matrix_for_a_root_node() {
        let node = create_test_node_3d("Test");
        set_translation(&node, 5.0, 0.0, 0.0);
        let mut state = revisions();
        ensure_node_world_matrix4(&node, &mut state);
        let world = cached_world_matrix(&node).expect("world matrix is cached");
        close(world.m[12], 5.0);
    }

    #[test]
    fn reuses_a_cached_world_matrix_when_nothing_was_invalidated() {
        let node = create_test_node_3d("Test");
        let mut state = revisions();
        ensure_node_world_matrix4(&node, &mut state);
        let first = cached_world_matrix(&node).expect("world matrix is cached");
        ensure_node_world_matrix4(&node, &mut state);
        let second = cached_world_matrix(&node).expect("world matrix is cached");
        assert_eq!(first.m, second.m);
    }

    #[test]
    fn computes_the_world_matrix_and_propagates_mid_chain_changes() {
        let root = create_test_node_3d("Test");
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&root, &parent);
        add_node_child(&parent, &child);
        set_translation(&root, 1.0, 0.0, 0.0);
        set_translation(&parent, 2.0, 0.0, 0.0);
        set_translation(&child, 3.0, 0.0, 0.0);
        let mut state = revisions();
        ensure_node_world_matrix4(&child, &mut state);
        close(get_node_world_matrix4(&child, &mut state).m[12], 6.0);
        set_translation(&parent, 20.0, 0.0, 0.0);
        close(get_node_world_matrix4(&child, &mut state).m[12], 24.0);
    }
}

mod get_node_local_matrix4 {
    use super::*;

    #[test]
    fn reflects_the_authored_translation() {
        let node = create_test_node_3d("Test");
        set_translation(&node, 3.0, 0.0, 0.0);
        close(get_node_local_matrix4(&node).m[12], 3.0);
    }
}

mod get_node_transform3d {
    use super::*;

    #[test]
    fn reads_the_node_trs_fields_into_a_carrier() {
        let node = create_test_node_3d("Test");
        edit(&node, |transform| {
            transform.position.x = 1.0;
            transform.position.y = 2.0;
            transform.position.z = 3.0;
            transform.scale.y = 4.0;
        });
        let mut out = flight_geometry::create_transform3d();
        get_node_transform3d(&mut out, &node);
        close(out.position.x, 1.0);
        close(out.position.y, 2.0);
        close(out.position.z, 3.0);
        close(out.scale.y, 4.0);
    }
}

mod get_node_world_matrix4 {
    use super::*;

    #[test]
    fn composes_parent_and_child_local_matrices() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_translation(&parent, 10.0, 0.0, 0.0);
        set_translation(&child, 5.0, 0.0, 0.0);
        close(get_node_world_matrix4(&child, &mut revisions()).m[12], 15.0);
    }

    #[test]
    fn updates_when_the_parent_transform_changes() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        let mut state = revisions();
        get_node_world_matrix4(&child, &mut state);
        set_translation(&parent, 7.0, 0.0, 0.0);
        close(get_node_world_matrix4(&child, &mut state).m[12], 7.0);
    }

    #[test]
    fn rotates_a_child_offset_by_the_parent_rotation() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_rotation_z(&parent, std::f32::consts::FRAC_PI_2);
        set_translation(&child, 1.0, 0.0, 0.0);
        let world = get_node_world_matrix4(&child, &mut revisions());
        close(world.m[12], 0.0);
        close(world.m[13], 1.0);
        close(world.m[14], 0.0);
    }

    #[test]
    fn composes_parent_translation_after_rotation_onto_a_child_offset() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_translation(&parent, 10.0, 0.0, 0.0);
        set_rotation_z(&parent, std::f32::consts::FRAC_PI_2);
        set_translation(&child, 1.0, 0.0, 0.0);
        let world = get_node_world_matrix4(&child, &mut revisions());
        close(world.m[12], 10.0);
        close(world.m[13], 1.0);
        close(world.m[14], 0.0);
    }

    #[test]
    fn scales_a_child_offset_and_scale_by_the_parent_scale() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_scale(&parent, 2.0, 2.0, 2.0);
        set_translation(&child, 3.0, 0.0, 0.0);
        let world = get_node_world_matrix4(&child, &mut revisions());
        close(world.m[12], 6.0);
        close(world.m[0], 2.0);
    }

    #[test]
    fn composes_a_three_level_translation_rotation_scale_chain() {
        let root = create_test_node_3d("Test");
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&root, &parent);
        add_node_child(&parent, &child);
        set_translation(&root, 1.0, 2.0, 3.0);
        set_rotation_z(&root, std::f32::consts::FRAC_PI_6);
        set_scale(&root, 2.0, 2.0, 2.0);
        set_translation(&parent, 4.0, 0.0, 0.0);
        set_rotation_z(&parent, std::f32::consts::FRAC_PI_4);
        set_translation(&child, 0.0, 5.0, 0.0);
        set_scale(&child, 3.0, 1.0, 1.0);
        let mut local_root = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        {
            let guard = root.read().unwrap();
            let transform = guard.as_transform3d_node().unwrap().transform3d();
            flight_geometry::compose_matrix4(
                &mut local_root,
                &transform.position,
                &transform.rotation,
                &transform.scale,
            );
        }
        let mut local_parent = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        {
            let guard = parent.read().unwrap();
            let transform = guard.as_transform3d_node().unwrap().transform3d();
            flight_geometry::compose_matrix4(
                &mut local_parent,
                &transform.position,
                &transform.rotation,
                &transform.scale,
            );
        }
        let mut local_child = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        {
            let guard = child.read().unwrap();
            let transform = guard.as_transform3d_node().unwrap().transform3d();
            flight_geometry::compose_matrix4(
                &mut local_child,
                &transform.position,
                &transform.rotation,
                &transform.scale,
            );
        }
        let mut root_times_parent = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        flight_geometry::multiply_matrix4(&mut root_times_parent, &local_root, &local_parent);
        let mut expected = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        flight_geometry::multiply_matrix4(&mut expected, &root_times_parent, &local_child);
        let world = get_node_world_matrix4(&child, &mut revisions());
        for index in 0..16 {
            close(world.m[index], expected.m[index]);
        }
    }

    #[test]
    fn propagates_a_grandparent_change_through_an_unchanged_middle_node() {
        let root = create_test_node_3d("Test");
        let mid = create_test_node_3d("Test");
        let leaf = create_test_node_3d("Test");
        add_node_child(&root, &mid);
        add_node_child(&mid, &leaf);
        set_translation(&root, 1.0, 0.0, 0.0);
        set_translation(&leaf, 2.0, 0.0, 0.0);
        let mut state = revisions();
        close(get_node_world_matrix4(&leaf, &mut state).m[12], 3.0);
        set_translation(&root, 100.0, 0.0, 0.0);
        close(get_node_world_matrix4(&leaf, &mut state).m[12], 102.0);
    }

    #[test]
    fn recomputes_the_world_matrix_after_reparenting() {
        let parent_a = create_test_node_3d("Test");
        let parent_b = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        set_translation(&parent_a, 10.0, 0.0, 0.0);
        set_translation(&parent_b, 0.0, 20.0, 0.0);
        set_translation(&child, 1.0, 0.0, 0.0);
        add_node_child(&parent_a, &child);
        let mut state = revisions();
        close(get_node_world_matrix4(&child, &mut state).m[12], 11.0);
        close(get_node_world_matrix4(&child, &mut state).m[13], 0.0);
        remove_node_child(&parent_a, &child);
        add_node_child(&parent_b, &child);
        let world = get_node_world_matrix4(&child, &mut state);
        close(world.m[12], 1.0);
        close(world.m[13], 20.0);
    }
}

mod is_node_local_matrix4_detached {
    use super::*;

    #[test]
    fn reports_a_directly_set_matrix_until_trs_authoring_returns() {
        let node = create_test_node_3d("Test");
        assert!(!is_node_local_matrix4_detached(&node));
        set_node_local_matrix4(
            &node,
            &flight_geometry::create_matrix4(
                None, None, None, None, None, None, None, None, None, None, None, None, None, None,
                None, None,
            ),
        );
        assert!(is_node_local_matrix4_detached(&node));
        edit(&node, |transform| transform.position.x = 1.0);
        assert!(!is_node_local_matrix4_detached(&node));
    }
}

mod set_node_local_matrix4 {
    use super::*;

    #[test]
    fn propagates_to_the_world_matrix() {
        let parent = create_test_node_3d("Test");
        let child = create_test_node_3d("Test");
        add_node_child(&parent, &child);
        set_node_local_matrix4(&parent, &translation_matrix(4.0, 0.0, 0.0));
        set_node_local_matrix4(&child, &translation_matrix(3.0, 0.0, 0.0));
        close(get_node_world_matrix4(&child, &mut revisions()).m[12], 7.0);
    }

    #[test]
    fn is_overridden_when_a_trs_write_reclaims_authority() {
        let node = create_test_node_3d("Test");
        set_node_local_matrix4(&node, &translation_matrix(9.0, 0.0, 0.0));
        set_translation(&node, 2.0, 0.0, 0.0);
        assert!(!is_node_local_matrix4_detached(&node));
        close(get_node_local_matrix4(&node).m[12], 2.0);
    }

    #[test]
    fn copies_the_source_matrix_rather_than_aliasing_it() {
        let node = create_test_node_3d("Test");
        let mut source = translation_matrix(5.0, 0.0, 0.0);
        set_node_local_matrix4(&node, &source);
        source.m[12] = 999.0;
        close(get_node_local_matrix4(&node).m[12], 5.0);
    }

    #[test]
    fn keeps_the_directly_set_matrix_through_local_resolution() {
        let node = create_test_node_3d("Test");
        let mut source = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        source.m[12] = 42.0;
        set_node_local_matrix4(&node, &source);
        ensure_node_local_matrix4(&node);
        close(get_node_local_matrix4(&node).m[12], 42.0);
        assert!(is_node_local_matrix4_detached(&node));
    }
}

mod set_node_transform3d {
    use super::*;

    #[test]
    fn copies_carrier_fields_into_the_node_and_reattaches_trs() {
        let node = create_test_node_3d("Test");
        let mut source = flight_geometry::create_transform3d();
        source.position.x = 7.0;
        source.scale.z = 2.0;
        set_node_transform3d(&node, &source);
        ensure_node_local_matrix4(&node);
        let matrix = get_node_local_matrix4(&node);
        close(matrix.m[12], 7.0);
        close(matrix.m[10], 2.0);
        assert!(!is_node_local_matrix4_detached(&node));
    }
}

mod sync_node_transform3d_from_matrix4 {
    use super::*;

    #[test]
    fn is_non_destructive_to_the_matrix_cache() {
        let node = create_test_node_3d("Test");
        set_node_local_matrix4(&node, &translation_matrix(3.0, 4.0, 5.0));
        sync_node_transform3d_from_matrix4(&node);
        let matrix = get_node_local_matrix4(&node);
        close(matrix.m[12], 3.0);
        close(matrix.m[13], 4.0);
        close(matrix.m[14], 5.0);
    }

    #[test]
    fn decomposes_a_directly_set_matrix_back_into_trs_fields() {
        let node = create_test_node_3d("Test");
        let mut source = flight_geometry::create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        source.m[12] = 9.0;
        source.m[13] = 8.0;
        source.m[14] = 7.0;
        set_node_local_matrix4(&node, &source);
        sync_node_transform3d_from_matrix4(&node);
        let guard = node.read().unwrap();
        let transform = guard.as_transform3d_node().unwrap().transform3d();
        close(transform.position.x, 9.0);
        close(transform.position.y, 8.0);
        close(transform.position.z, 7.0);
        assert!(
            !guard
                .as_transform3d_node()
                .unwrap()
                .transform3d_runtime()
                .local_matrix4_detached
        );
    }
}
