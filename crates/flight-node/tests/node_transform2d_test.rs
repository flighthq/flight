use flight_node::contract::*;

use crate::support::create_test_node_2d;

const CLOSE: f32 = 1e-3;

fn close(actual: f32, expected: f32) {
    assert!((actual - expected).abs() <= CLOSE, "{actual} != {expected}");
}

fn edit(node: &NodeRef, apply: impl FnOnce(&mut HasTransform2D)) {
    {
        let mut guard = node.write().unwrap();
        let transform = guard
            .as_transform2d_node_mut()
            .expect("test node is a Transform2D node");
        apply(transform.transform2d_mut());
    }
    invalidate_node_local_transform(node);
}

fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

mod convert_node_vector2_global_to_local {
    use super::*;

    #[test]
    fn reuses_the_output_object() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.x = 10.0;
            transform.y = 20.0;
            transform.scale_x = 2.0;
            transform.scale_y = 2.0;
        });
        let mut out = flight_geometry::create_vector2(999.0, 999.0);
        let world = flight_geometry::create_vector2(10.0, 20.0);
        convert_node_vector2_global_to_local(&mut out, &node, &world, &mut revisions());
        close(out.x, 0.0);
        close(out.y, 0.0);
    }

    #[test]
    fn writes_into_the_provided_output_and_inverts_the_node_transform() {
        let parent = create_test_node_2d("Test");
        let node = create_test_node_2d("Test");
        add_node_child(&parent, &node);
        edit(&node, |transform| {
            transform.x = 10.0;
            transform.y = 20.0;
            transform.scale_x = 2.0;
            transform.scale_y = 2.0;
        });
        let mut out = flight_geometry::create_vector2(999.0, 999.0);
        let world = flight_geometry::create_vector2(14.0, 24.0);
        convert_node_vector2_global_to_local(&mut out, &node, &world, &mut revisions());
        close(out.x, 2.0);
        close(out.y, 2.0);
        let mut origin = flight_geometry::create_vector2(0.0, 0.0);
        let local_origin = flight_geometry::create_vector2(10.0, 20.0);
        convert_node_vector2_global_to_local(&mut origin, &node, &local_origin, &mut revisions());
        close(origin.x, 0.0);
        close(origin.y, 0.0);
    }
}

mod convert_node_vector2_local_to_global {
    use super::*;

    #[test]
    fn writes_to_out_and_respects_the_world_transform() {
        let node = create_test_node_2d("Test");
        let mut out = flight_geometry::create_vector2(0.0, 0.0);
        convert_node_vector2_local_to_global(
            &mut out,
            &node,
            &flight_geometry::create_vector2(5.0, 5.0),
            &mut revisions(),
        );
        close(out.x, 5.0);
        close(out.y, 5.0);
        edit(&node, |transform| {
            transform.x = 50.0;
            transform.y = 30.0;
        });
        let mut translated = flight_geometry::create_vector2(0.0, 0.0);
        convert_node_vector2_local_to_global(
            &mut translated,
            &node,
            &flight_geometry::create_vector2(10.0, 20.0),
            &mut revisions(),
        );
        close(translated.x, 60.0);
        close(translated.y, 50.0);
    }

    #[test]
    fn produces_independent_results_from_multiple_points() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.x = 1.0;
            transform.y = 2.0;
        });
        let mut first = flight_geometry::create_vector2(0.0, 0.0);
        let mut second = flight_geometry::create_vector2(0.0, 0.0);
        convert_node_vector2_local_to_global(
            &mut first,
            &node,
            &flight_geometry::create_vector2(1.0, 1.0),
            &mut revisions(),
        );
        convert_node_vector2_local_to_global(
            &mut second,
            &node,
            &flight_geometry::create_vector2(2.0, 2.0),
            &mut revisions(),
        );
        close(first.x, 2.0);
        close(first.y, 3.0);
        close(second.x, 3.0);
        close(second.y, 4.0);
    }
}

mod ensure_node_local_matrix {
    use super::*;

    #[test]
    fn computes_local_transform_the_first_time() {
        let node = create_test_node_2d("Test");
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .local_matrix
                .is_none()
        );
        ensure_node_local_matrix(&node);
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .local_matrix
                .is_some()
        );
    }

    #[test]
    fn recomputes_when_the_local_transform_revision_changes() {
        let node = create_test_node_2d("Test");
        ensure_node_local_matrix(&node);
        let cached = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d_runtime()
            .local_matrix
            .clone()
            .unwrap();
        {
            let mut guard = node.write().unwrap();
            let runtime = guard.node_runtime_mut();
            runtime.local_transform_id += 1;
            let transform_runtime = guard
                .as_transform2d_node_mut()
                .unwrap()
                .transform2d_runtime_mut();
            let stale = transform_runtime.local_matrix.as_mut().unwrap();
            stale.a = -1.0;
            stale.b = -1.0;
            stale.c = -1.0;
            stale.d = -1.0;
            stale.tx = -1.0;
            stale.ty = -1.0;
        }
        ensure_node_local_matrix(&node);
        assert_eq!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .local_matrix,
            Some(cached)
        );
    }

    #[test]
    fn normalizes_rotations_above_and_below_180_degrees() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| transform.rotation = 270.0);
        ensure_node_local_matrix(&node);
        {
            let guard = node.read().unwrap();
            let runtime = guard.as_transform2d_node().unwrap().transform2d_runtime();
            close(runtime.rotation_angle, -90.0);
            close(runtime.local_matrix.as_ref().unwrap().b, -1.0);
        }
        edit(&node, |transform| transform.rotation = -270.0);
        ensure_node_local_matrix(&node);
        let guard = node.read().unwrap();
        let runtime = guard.as_transform2d_node().unwrap().transform2d_runtime();
        close(runtime.rotation_angle, 90.0);
        close(runtime.local_matrix.as_ref().unwrap().b, 1.0);
    }
}

mod ensure_node_world_matrix {
    use super::*;

    #[test]
    fn computes_world_transform_the_first_time_and_for_a_parent() {
        let parent = create_test_node_2d("Test");
        let node = create_test_node_2d("Test");
        add_node_child(&parent, &node);
        ensure_node_world_matrix(&node, &mut revisions());
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .world_matrix
                .is_some()
        );
        assert!(
            parent
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .world_matrix
                .is_some()
        );
    }

    #[test]
    fn recomputes_when_the_local_transform_revision_changes() {
        let node = create_test_node_2d("Test");
        let mut state = revisions();
        ensure_node_world_matrix(&node, &mut state);
        let cached = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d_runtime()
            .world_matrix
            .clone()
            .unwrap();
        {
            let mut guard = node.write().unwrap();
            guard.node_runtime_mut().local_transform_id += 1;
            let stale = guard
                .as_transform2d_node_mut()
                .unwrap()
                .transform2d_runtime_mut()
                .world_matrix
                .as_mut()
                .unwrap();
            stale.a = -1.0;
            stale.b = -1.0;
            stale.c = -1.0;
            stale.d = -1.0;
            stale.tx = -1.0;
            stale.ty = -1.0;
        }
        ensure_node_world_matrix(&node, &mut state);
        assert_eq!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .world_matrix,
            Some(cached)
        );
    }

    #[test]
    fn recomputes_when_the_parent_transform_revision_changes() {
        let parent = create_test_node_2d("Test");
        let node = create_test_node_2d("Test");
        add_node_child(&parent, &node);
        let mut state = revisions();
        ensure_node_world_matrix(&node, &mut state);
        let cached = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d_runtime()
            .world_matrix
            .clone()
            .unwrap();
        parent
            .write()
            .unwrap()
            .node_runtime_mut()
            .world_transform_id += 1;
        ensure_node_world_matrix(&node, &mut state);
        assert_eq!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .world_matrix,
            Some(cached)
        );
    }
}

mod get_node_local_matrix {
    use super::*;

    #[test]
    fn ensures_and_returns_the_local_transform() {
        let node = create_test_node_2d("Test");
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .local_matrix
                .is_none()
        );
        let matrix = get_node_local_matrix(&node);
        assert_eq!(matrix.a, 1.0);
        assert_eq!(matrix.d, 1.0);
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .local_matrix
                .is_some()
        );
    }

    #[test]
    fn returns_the_cached_local_transform() {
        let node = create_test_node_2d("Test");
        let matrix = get_node_local_matrix(&node);
        let cached = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d_runtime()
            .local_matrix
            .clone();
        assert_eq!(Some(matrix), cached);
    }

    #[test]
    fn offsets_translation_by_the_pivot_so_the_pivot_lands_at_x_y() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.x = 100.0;
            transform.y = 50.0;
            transform.pivot_x = 10.0;
            transform.pivot_y = 20.0;
        });
        let matrix = get_node_local_matrix(&node);
        close(matrix.tx, 90.0);
        close(matrix.ty, 30.0);
    }

    #[test]
    fn scales_the_pivot_offset_with_scale() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.scale_x = 2.0;
            transform.scale_y = 3.0;
            transform.pivot_x = 10.0;
            transform.pivot_y = 10.0;
        });
        let matrix = get_node_local_matrix(&node);
        close(matrix.tx, -20.0);
        close(matrix.ty, -30.0);
    }
}

mod get_node_transform2d {
    use super::*;

    #[test]
    fn reads_the_node_fields_into_a_carrier() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.x = 3.0;
            transform.y = 4.0;
            transform.rotation = 30.0;
            transform.scale_x = 2.0;
            transform.skew_y = 5.0;
        });
        let mut out =
            flight_geometry::create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        get_node_transform2d(&mut out, &node);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
        assert_eq!(out.rotation, 30.0);
        assert_eq!(out.scale_x, 2.0);
        assert_eq!(out.skew_y, 5.0);
    }
}

mod get_node_world_matrix {
    use super::*;

    #[test]
    fn ensures_and_returns_the_world_transform() {
        let node = create_test_node_2d("Test");
        assert!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d_runtime()
                .world_matrix
                .is_none()
        );
        let matrix = get_node_world_matrix(&node, &mut revisions());
        assert_eq!(matrix.a, 1.0);
        let cached = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d_runtime()
            .world_matrix
            .clone();
        assert_eq!(Some(matrix), cached);
    }
}

mod set_node_local_matrix {
    use super::*;

    #[test]
    fn round_trips_the_effective_transform_through_the_local_matrix() {
        let node = create_test_node_2d("Test");
        set_node_local_matrix(
            &node,
            &flight_geometry::create_matrix(2.0, 0.0, 0.0, 3.0, 10.0, 20.0),
        );
        {
            let guard = node.read().unwrap();
            let transform = guard.as_transform2d_node().unwrap().transform2d();
            close(transform.scale_x, 2.0);
            close(transform.scale_y, 3.0);
            close(transform.x, 10.0);
            close(transform.y, 20.0);
        }
        let matrix = get_node_local_matrix(&node);
        close(matrix.a, 2.0);
        close(matrix.d, 3.0);
        close(matrix.tx, 10.0);
        close(matrix.ty, 20.0);
    }

    #[test]
    fn round_trips_reflected_and_rotated_reflected_matrices() {
        let node = create_test_node_2d("Test");
        set_node_local_matrix(
            &node,
            &flight_geometry::create_matrix(1.0, 0.0, 0.0, -1.0, 0.0, 0.0),
        );
        let reflected = get_node_local_matrix(&node);
        close(reflected.a, 1.0);
        close(reflected.b, 0.0);
        close(reflected.c, 0.0);
        close(reflected.d, -1.0);
        set_node_local_matrix(
            &node,
            &flight_geometry::create_matrix(0.5, 0.8, 0.8, -0.5, 3.0, 4.0),
        );
        let rotated = get_node_local_matrix(&node);
        close(rotated.a, 0.5);
        close(rotated.b, 0.8);
        close(rotated.c, 0.8);
        close(rotated.d, -0.5);
        close(rotated.tx, 3.0);
        close(rotated.ty, 4.0);
    }

    #[test]
    fn resets_the_pivot_and_absorbs_its_offset_into_translation() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.pivot_x = 5.0;
            transform.pivot_y = 5.0;
        });
        set_node_local_matrix(
            &node,
            &flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 7.0, 8.0),
        );
        let guard = node.read().unwrap();
        let transform = guard.as_transform2d_node().unwrap().transform2d();
        assert_eq!(transform.pivot_x, 0.0);
        assert_eq!(transform.pivot_y, 0.0);
        close(transform.x, 7.0);
        close(transform.y, 8.0);
    }
}

mod set_node_transform2d {
    use super::*;

    #[test]
    fn copies_carrier_fields_into_the_node_and_rebuilds_the_matrix() {
        let node = create_test_node_2d("Test");
        let source =
            flight_geometry::create_transform2d(10.0, 20.0, 0.0, 2.0, 4.0, 0.0, 0.0, 0.0, 0.0);
        set_node_transform2d(&node, &source);
        let matrix = get_node_local_matrix(&node);
        close(matrix.a, 2.0);
        close(matrix.d, 4.0);
        close(matrix.tx, 10.0);
        close(matrix.ty, 20.0);
    }
}

mod skew {
    use super::*;

    fn degrees(value: f32) -> f32 {
        return value * std::f32::consts::PI / 180.0;
    }

    #[test]
    fn applies_isolated_skew_to_the_expected_cells() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| transform.skew_x = 45.0);
        let x_matrix = get_node_local_matrix(&node);
        close(x_matrix.a, 1.0);
        close(x_matrix.b, 0.0);
        close(x_matrix.c, -degrees(45.0).sin());
        close(x_matrix.d, degrees(45.0).cos());
        edit(&node, |transform| {
            transform.skew_x = 0.0;
            transform.skew_y = 30.0;
        });
        let y_matrix = get_node_local_matrix(&node);
        close(y_matrix.a, degrees(30.0).cos());
        close(y_matrix.b, degrees(30.0).sin());
        close(y_matrix.c, 0.0);
        close(y_matrix.d, 1.0);
    }

    #[test]
    fn produces_the_same_matrix_with_zero_skew_as_without_skew() {
        let with_skew = create_test_node_2d("Test");
        edit(&with_skew, |transform| {
            transform.rotation = 30.0;
            transform.scale_x = 2.0;
            transform.scale_y = 3.0;
            transform.skew_x = 0.0;
            transform.skew_y = 0.0;
        });
        let without_skew = create_test_node_2d("Test");
        edit(&without_skew, |transform| {
            transform.rotation = 30.0;
            transform.scale_x = 2.0;
            transform.scale_y = 3.0;
        });
        let skewed = get_node_local_matrix(&with_skew);
        let plain = get_node_local_matrix(&without_skew);
        close(skewed.a, plain.a);
        close(skewed.b, plain.b);
        close(skewed.c, plain.c);
        close(skewed.d, plain.d);
        close(skewed.tx, plain.tx);
        close(skewed.ty, plain.ty);
    }

    #[test]
    fn propagates_skew_through_the_world_transform() {
        let parent = create_test_node_2d("Test");
        edit(&parent, |transform| {
            transform.skew_x = 10.0;
            transform.skew_y = 20.0;
            transform.scale_x = 2.0;
            transform.scale_y = 1.0;
        });
        let child = create_test_node_2d("Test");
        edit(&child, |transform| {
            transform.x = 50.0;
        });
        add_node_child(&parent, &child);
        let parent_local = get_node_local_matrix(&parent);
        let child_local = get_node_local_matrix(&child);
        let mut expected = flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        flight_geometry::multiply_matrix(&mut expected, &parent_local, &child_local);
        let world = get_node_world_matrix(&child, &mut revisions());
        close(world.a, expected.a);
        close(world.b, expected.b);
        close(world.c, expected.c);
        close(world.d, expected.d);
        close(world.tx, expected.tx);
        close(world.ty, expected.ty);
    }

    #[test]
    fn computes_all_four_cells_with_combined_skew_and_rotation() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.rotation = 45.0;
            transform.skew_x = 15.0;
            transform.skew_y = 20.0;
        });
        let matrix = get_node_local_matrix(&node);
        close(matrix.a, degrees(65.0).cos());
        close(matrix.b, degrees(65.0).sin());
        close(matrix.c, -degrees(60.0).sin());
        close(matrix.d, degrees(60.0).cos());
    }

    #[test]
    fn computes_tx_ty_when_pivot_and_skew_are_both_nonzero() {
        let node = create_test_node_2d("Test");
        edit(&node, |transform| {
            transform.skew_x = 30.0;
            transform.skew_y = 45.0;
            transform.scale_x = 2.0;
            transform.scale_y = 3.0;
            transform.pivot_x = 10.0;
            transform.pivot_y = 20.0;
            transform.x = 100.0;
            transform.y = 50.0;
        });
        let matrix = get_node_local_matrix(&node);
        let a = degrees(45.0).cos() * 2.0;
        let b = degrees(45.0).sin() * 2.0;
        let c = -degrees(30.0).sin() * 3.0;
        let d = degrees(30.0).cos() * 3.0;
        close(matrix.a, a);
        close(matrix.b, b);
        close(matrix.c, c);
        close(matrix.d, d);
        close(matrix.tx, 100.0 - (a * 10.0 + c * 20.0));
        close(matrix.ty, 50.0 - (b * 10.0 + d * 20.0));
    }
}
