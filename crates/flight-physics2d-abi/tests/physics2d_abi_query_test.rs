// flight-lint: allow-file(f64) D1: query values are the wire's IEEE doubles and circle scalars are flight-collision's f64 shape fields
use flight_collision::{CollisionAabb2D, CollisionCircle2D, CollisionShape2D};
use flight_physics2d::{
    Physics2DBodyType, Physics2DMaterial, create_physics2d_collider, create_rigid_body2d,
};
use flight_physics2d_abi::contract::*;
use flight_spatial::SpatialAabb2D;

const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

// D1 single-evaluation bound at a public f32 (Principal 192423ac): the query rows widen f32 physics.
fn assert_f32_single(actual: f64, expected: f64, ts_bound: f64) {
    let bound = ts_bound.max(4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "expected {}, got {} (bound {})",
        expected,
        actual,
        bound
    );
}

// Two unit boxes on the x axis at 0 and 10, so a ray along +x meets a known order and a point query
// has an unambiguous answer.
fn world() -> (Physics2DAbi, Physics2DAbiWorldHandle) {
    let abi = create_physics2d_abi();
    let handle = create_physics2d_abi_world(&abi);
    let mut commands = create_physics2d_abi_command_buffer(Some(4096));
    for (id, x) in [(1, 0.0), (2, 10.0)] {
        let body = create_rigid_body2d(Physics2DBodyType::Static, x, 0.0, None);
        let collider = create_physics2d_collider(
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: -0.5,
                min_y: -0.5,
                max_x: 0.5,
                max_y: 0.5,
            }),
            &MATERIAL,
            None,
            None,
        );
        assert!(write_physics2d_abi_set_body_command(
            &mut commands,
            id,
            &body.read().unwrap()
        ));
        assert!(write_physics2d_abi_set_collider_command(
            &mut commands,
            id,
            id,
            &collider.read().unwrap()
        ));
    }
    let mut result = create_physics2d_abi_execution_result();
    assert!(execute_physics2d_abi_commands(
        &mut result,
        &abi,
        handle,
        &commands
    ));
    return (abi, handle);
}

mod query_physics2d_abi_point {
    use super::*;

    #[test]
    fn names_the_body_containing_the_point_and_zeroes_the_geometric_row() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        out.values[..5].copy_from_slice(&[9.0; 5]);
        assert!(query_physics2d_abi_point(
            &mut out, &abi, handle, 0.0, 0.0, None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.body_ids[0], 1);
        assert_eq!(out.collider_ids[0], 1);
        // A point hit has no fraction or normal, and reporting a stale one would be worse than none.
        assert_eq!(&out.values[..5], &[0.0; 5]);
    }

    #[test]
    fn returns_an_empty_answer_for_empty_space() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        assert!(query_physics2d_abi_point(
            &mut out, &abi, handle, 5.0, 5.0, None
        ));
        assert_eq!(out.count, 0);
        assert_eq!(out.required_count, 0);
    }

    #[test]
    fn does_not_republish_a_previous_hit_when_a_reused_query_result_misses() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        assert!(query_physics2d_abi_point(
            &mut out, &abi, handle, 0.0, 0.0, None
        ));
        assert_eq!(out.count, 1);

        assert!(query_physics2d_abi_point(
            &mut out, &abi, handle, 5.0, 5.0, None
        ));
        assert_eq!(out.count, 0);
        assert_eq!(out.required_count, 0);
    }
}

mod query_physics2d_abi_ray {
    use super::*;

    #[test]
    fn reports_every_crossing_with_its_fraction_point_and_normal() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(8);
        assert!(query_physics2d_abi_ray(
            &mut out,
            &abi,
            handle,
            -5.0,
            0.0,
            1.0,
            0.0,
            Some(100.0),
            None
        ));
        assert_eq!(out.count, 2);
        for i in 0..out.count {
            let base = i * PHYSICS2D_ABI_QUERY_VALUE_STRIDE;
            assert!(out.values[base + PHYSICS2D_ABI_QUERY_VALUE_FRACTION] > 0.0);
            // D1 f32 bound (TS: 0.5e-9)
            assert_f32_single(
                out.values[base + PHYSICS2D_ABI_QUERY_VALUE_NORMAL_X],
                -1.0,
                0.5e-9,
            );
            // D1 f32 bound (TS: 0.5e-9)
            assert_f32_single(out.values[base + PHYSICS2D_ABI_QUERY_VALUE_Y], 0.0, 0.5e-9);
        }
    }
}

mod query_physics2d_abi_ray_closest {
    use super::*;

    #[test]
    fn keeps_only_the_nearest_crossing() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(8);
        assert!(query_physics2d_abi_ray_closest(
            &mut out,
            &abi,
            handle,
            -5.0,
            0.0,
            1.0,
            0.0,
            Some(100.0),
            None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.body_ids[0], 1);
        // D1 f32 bound (TS: 0.5e-9)
        assert_f32_single(out.values[PHYSICS2D_ABI_QUERY_VALUE_X], -0.5, 0.5e-9);
    }

    #[test]
    fn publishes_only_the_current_closest_hit_after_an_all_hits_query_reused_the_scratch_rows() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(8);
        assert!(query_physics2d_abi_ray(
            &mut out,
            &abi,
            handle,
            -5.0,
            0.0,
            1.0,
            0.0,
            Some(100.0),
            None
        ));
        assert_eq!(out.count, 2);

        assert!(query_physics2d_abi_ray_closest(
            &mut out,
            &abi,
            handle,
            -5.0,
            0.0,
            1.0,
            0.0,
            Some(100.0),
            None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.required_count, 1);
        assert_eq!(out.body_ids[0], 1);
    }

    #[test]
    fn defaults_to_an_unbounded_ray() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(8);
        // From x = -500 a direction of length one needs fraction ~489 to reach the first box.
        assert!(query_physics2d_abi_ray_closest(
            &mut out, &abi, handle, -500.0, 0.0, 1.0, 0.0, None, None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.body_ids[0], 1);
    }
}

mod query_physics2d_abi_region {
    use super::*;

    #[test]
    fn reports_capacity_exhaustion_through_required_count_rather_than_by_truncating_silently() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(1);
        let region = SpatialAabb2D {
            min_x: -20.0,
            min_y: -20.0,
            max_x: 20.0,
            max_y: 20.0,
        };
        assert!(query_physics2d_abi_region(
            &mut out, &abi, handle, &region, None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.required_count, 2);
    }
}

mod query_physics2d_abi_shape_cast {
    use super::*;

    fn probe(y: f64) -> CollisionShape2D {
        return CollisionShape2D::Circle(CollisionCircle2D {
            x: -5.0,
            y,
            radius: 0.25,
        });
    }

    #[test]
    fn stops_at_the_first_body_along_the_sweep() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        assert!(query_physics2d_abi_shape_cast(
            &mut out,
            &abi,
            handle,
            &probe(0.0),
            20.0,
            0.0,
            Some(1.0),
            None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.body_ids[0], 1);
        assert!(out.values[PHYSICS2D_ABI_QUERY_VALUE_FRACTION] > 0.0);
        assert!(out.values[PHYSICS2D_ABI_QUERY_VALUE_FRACTION] < 1.0);
    }

    #[test]
    fn reports_a_clean_miss_as_an_empty_answer() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        assert!(query_physics2d_abi_shape_cast(
            &mut out,
            &abi,
            handle,
            &probe(40.0),
            20.0,
            0.0,
            Some(1.0),
            None
        ));
        assert_eq!(out.count, 0);
        assert_eq!(out.required_count, 0);
    }

    #[test]
    fn defaults_to_the_full_sweep() {
        let (abi, handle) = world();
        let mut out = create_physics2d_abi_query_buffer(4);
        assert!(query_physics2d_abi_shape_cast(
            &mut out,
            &abi,
            handle,
            &probe(0.0),
            20.0,
            0.0,
            None,
            None
        ));
        assert_eq!(out.count, 1);
        // Half the sweep stops short of the first box at x = -0.5.
        assert!(query_physics2d_abi_shape_cast(
            &mut out,
            &abi,
            handle,
            &probe(0.0),
            8.0,
            0.0,
            Some(0.5),
            None
        ));
        assert_eq!(out.count, 0);
    }
}
