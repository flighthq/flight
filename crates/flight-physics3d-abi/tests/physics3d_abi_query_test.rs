// flight-lint: allow-file(f64) D1: query values are the wire's IEEE doubles
use flight_physics3d::{Physics3DBodyType, create_physics_3d_query_filter};
use flight_physics3d_abi::contract::*;
use flight_spatial::SpatialAabb3D;

use crate::support::*;

fn add_query_body(commands: &mut Physics3DAbiCommandBuffer, body_id: u32, collider_id: u32) {
    let body = rigid_body3d(Physics3DBodyType::Static);
    body.write().unwrap().x = 5.0;
    write_physics3d_abi_set_body_command(commands, body_id, &body.read().unwrap());
    write_physics3d_abi_set_collider_command(
        commands,
        collider_id,
        body_id,
        &physics3d_collider(&unit_aabb(), None).read().unwrap(),
    );
}

fn create_query_world() -> (Physics3DAbi, Physics3DAbiWorldHandle) {
    let abi = create_physics3d_abi();
    let world = create_physics3d_abi_world(&abi);
    let mut commands = create_physics3d_abi_command_buffer(None);
    add_query_body(&mut commands, 101, 201);
    add_query_body(&mut commands, 102, 202);
    let mut result = create_physics3d_abi_execution_result();
    assert!(
        execute_physics3d_abi_commands(&mut result, &abi, world, &commands),
        "{:?}",
        result.status
    );
    return (abi, world);
}

mod query_physics3d_abi_point {
    use super::*;

    #[test]
    fn reports_all_hits_and_the_complete_count_when_output_capacity_truncates_them() {
        let (abi, world) = create_query_world();
        let mut out = create_physics3d_abi_query_buffer(1);

        assert!(query_physics3d_abi_point(
            &mut out, &abi, world, 5.0, 0.0, 0.0, None
        ));
        assert_eq!(out.count, 1);
        assert_eq!(out.required_count, 2);
        assert!([101, 102].contains(&out.body_ids[0]));
        assert!([201, 202].contains(&out.collider_ids[0]));
        assert_eq!(&out.values[..], &[0.0; 7]);
    }

    #[test]
    fn applies_the_standard_physics3d_query_filter() {
        let (abi, world) = create_query_world();
        let mut filter = create_physics_3d_query_filter();
        filter.include_static = false;
        let mut out = create_physics3d_abi_query_buffer(2);

        assert!(query_physics3d_abi_point(
            &mut out,
            &abi,
            world,
            5.0,
            0.0,
            0.0,
            Some(&filter)
        ));
        assert_eq!((out.count, out.required_count), (0, 0));
    }
}

mod query_physics3d_abi_ray {
    use super::*;

    #[test]
    fn writes_fraction_hit_point_and_normal_for_every_ray_hit() {
        let (abi, world) = create_query_world();
        let mut out = create_physics3d_abi_query_buffer(2);

        assert!(query_physics3d_abi_ray(
            &mut out,
            &abi,
            world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(10.0),
            None
        ));
        assert_eq!(out.count, 2);
        assert_eq!(out.required_count, 2);
        // D1 f32 bound (TS: toBeCloseTo(4.5, 12))
        let bound = 4.0 * f64::from(f32::EPSILON) * 4.5;
        assert!((out.values[PHYSICS3D_ABI_QUERY_VALUE_FRACTION] - 4.5).abs() <= bound);
        // D1 f32 bound (TS: toBeCloseTo(4.5, 12))
        assert!((out.values[PHYSICS3D_ABI_QUERY_VALUE_X] - 4.5).abs() <= bound);
        assert_eq!(out.values[PHYSICS3D_ABI_QUERY_VALUE_NORMAL_X], -1.0);
    }
}

mod query_physics3d_abi_ray_closest {
    use super::*;

    #[test]
    fn publishes_exactly_one_deterministic_closest_hit() {
        let (abi, world) = create_query_world();
        let mut out = create_physics3d_abi_query_buffer(2);

        assert!(query_physics3d_abi_ray_closest(
            &mut out,
            &abi,
            world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(10.0),
            None
        ));
        assert_eq!((out.count, out.required_count), (1, 1));
        assert_eq!(out.body_ids[0], 101);
    }
}

mod query_physics3d_abi_region {
    use super::*;

    #[test]
    fn maps_broadphase_region_results_back_to_caller_owned_ids() {
        let (abi, world) = create_query_world();
        let mut out = create_physics3d_abi_query_buffer(2);
        let region = SpatialAabb3D {
            min_x: 4.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 6.0,
            max_y: 1.0,
            max_z: 1.0,
        };

        assert!(query_physics3d_abi_region(
            &mut out, &abi, world, &region, None
        ));
        assert_eq!(out.count, 2);
        let mut body_ids = out.body_ids.to_vec();
        body_ids.sort_unstable();
        assert_eq!(body_ids, [101, 102]);
    }
}

mod query_physics3d_abi_shape_cast {
    use super::*;

    #[test]
    fn writes_the_first_swept_shape_impact_into_the_shared_query_layout() {
        let (abi, world) = create_query_world();
        let mut out = create_physics3d_abi_query_buffer(1);

        assert!(query_physics3d_abi_shape_cast(
            &mut out,
            &abi,
            world,
            &unit_aabb_shape(),
            10.0,
            0.0,
            0.0,
            None,
            None
        ));
        assert_eq!((out.count, out.required_count), (1, 1));
        assert_eq!(out.body_ids[0], 101);
        // D1 f32 bound (TS: toBeCloseTo(0.4, 4))
        assert!((out.values[PHYSICS3D_ABI_QUERY_VALUE_FRACTION] - 0.4).abs() <= 0.5e-4);
    }
}
