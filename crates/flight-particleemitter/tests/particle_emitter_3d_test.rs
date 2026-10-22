use flight_geometry::create_aabb;
use flight_particles::contract::create_particle_emitter_config;
use flight_particleemitter::*;

const VEL_STRIDE: usize = PARTICLE_VELOCITY_STRIDE_3D;
const T_STRIDE: usize = PARTICLE_TRANSFORM_STRIDE;

mod append_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn appends_a_particle_with_z_coordinate() {
        let mut emitter = create_particle_emitter_3d();
        let index = append_particle_emitter_3d_particle(&mut emitter, 5, 10.0, 20.0, 30.0, 0.5, 2.0);
        assert_eq!(index, 0);
        assert_eq!(emitter.data.particle_count, 1);
        assert_eq!(emitter.data.ids[0], 5);
        assert_eq!(emitter.data.transforms[0], 10.0);
        assert_eq!(emitter.data.transforms[1], 20.0);
        assert_eq!(emitter.data.transforms[2], 0.5);
        assert_eq!(emitter.data.transforms[3], 2.0);
        assert_eq!(emitter.data.positions_z[0], 30.0);
        assert_eq!(emitter.data.alphas[0], 1.0);
    }

    #[test]
    fn auto_grows_capacity() {
        let mut emitter = create_particle_emitter_3d();
        for i in 0..20 {
            append_particle_emitter_3d_particle(&mut emitter, i as u16, i as f32, i as f32, i as f32, 0.0, 1.0);
        }
        assert_eq!(emitter.data.particle_count, 20);
        assert!(get_particle_emitter_3d_capacity(&emitter) >= 20);
    }
}

mod clear_particle_emitter_3d {
    use super::*;

    #[test]
    fn resets_particle_count_to_zero() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 2, 0.0, 0.0, 0.0, 0.0, 1.0);
        clear_particle_emitter_3d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

mod clone_particle_emitter_3d {
    use super::*;

    #[test]
    fn deep_copies_particle_buffers_and_preserves_blend_mode_and_world_space() {
        let mut emitter = ParticleEmitter3D {
            blend_mode: Some("add".to_string()),
            ..create_particle_emitter_3d()
        };
        emitter.data.world_space = true;
        append_particle_emitter_3d_particle(&mut emitter, 7, 1.0, 2.0, 3.0, 0.5, 2.0);
        let vt = 0 * VEL_STRIDE;
        emitter.data.velocities[vt] = 4.0;
        emitter.data.velocities[vt + 1] = 5.0;
        emitter.data.velocities[vt + 2] = 6.0;
        let clone = clone_particle_emitter_3d(&emitter);
        assert_eq!(clone.blend_mode.as_deref(), Some("add"));
        assert_eq!(clone.data.world_space, true);
        assert_eq!(clone.data.particle_count, 1);
        assert_eq!(clone.data.transforms[0], 1.0);
        assert_eq!(clone.data.positions_z[0], 3.0);
        assert!((clone.data.velocities[vt + 2] - 6.0).abs() < 1e-5);
        let mut clone = clone;
        clone.data.transforms[0] = 99.0;
        assert_eq!(emitter.data.transforms[0], 1.0);
    }
}

mod compact_particle_emitter_3d {
    use super::*;

    #[test]
    fn removes_deleted_particles_and_preserves_order() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 10.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 2, 20.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 3, 30.0, 0.0, 0.0, 0.0, 1.0);
        emitter.data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_3d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 2);
        assert_eq!(emitter.data.ids[0], 1);
        assert_eq!(emitter.data.ids[1], 3);
        assert_eq!(emitter.data.transforms[0], 10.0);
        assert_eq!(emitter.data.transforms[4], 30.0);
    }

    #[test]
    fn carries_z_velocity_lane_when_sliding_survivors_down() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 2, 0.0, 0.0, 0.0, 0.0, 1.0);
        let vt = 1 * VEL_STRIDE;
        emitter.data.velocities[vt] = 4.0;
        emitter.data.velocities[vt + 1] = 5.0;
        emitter.data.velocities[vt + 2] = 6.0;
        emitter.data.ids[0] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_3d(&mut emitter);
        assert!((emitter.data.velocities[0] - 4.0).abs() < 1e-5);
        assert!((emitter.data.velocities[1] - 5.0).abs() < 1e-5);
        assert!((emitter.data.velocities[2] - 6.0).abs() < 1e-5);
    }

    #[test]
    fn no_ops_on_empty_emitter() {
        let mut emitter = create_particle_emitter_3d();
        compact_particle_emitter_3d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

mod compute_particle_emitter_3d_local_bounds_aabb {
    use super::*;

    #[test]
    fn returns_zero_aabb_for_empty_emitter() {
        let emitter = create_particle_emitter_3d();
        let mut aabb = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_3d_local_bounds_aabb(&mut aabb, &emitter);
        assert_eq!(aabb.min.x, 0.0);
        assert_eq!(aabb.max.x, 0.0);
    }

    #[test]
    fn computes_bounds_with_billboard_radius() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 10.0, 20.0, 30.0, 0.0, 2.0);
        let mut aabb = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_3d_local_bounds_aabb(&mut aabb, &emitter);
        let r = std::f32::consts::FRAC_1_SQRT_2 * 2.0;
        assert!((aabb.min.x - (10.0 - r)).abs() < 1e-5);
        assert!((aabb.max.x - (10.0 + r)).abs() < 1e-5);
        assert!((aabb.min.z - (30.0 - r)).abs() < 1e-5);
        assert!((aabb.max.z - (30.0 + r)).abs() < 1e-5);
    }
}

mod create_particle_emitter_3d {
    use super::*;

    #[test]
    fn creates_an_empty_emitter() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(emitter.data.particle_count, 0);
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 0);
    }
}

mod get_particle_emitter_3d_capacity {
    use super::*;

    #[test]
    fn returns_zero_for_a_fresh_emitter() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 0);
    }

    #[test]
    fn returns_capacity_after_reserve() {
        let mut emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&mut emitter, 64);
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 64);
    }

    #[test]
    fn is_bounded_by_every_per_particle_storage_lane() {
        let mut emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&mut emitter, 8);
        emitter.data.positions_z = vec![0.0; 3];
        emitter.data.colors = vec![0.0; 2 * 3];
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 2);
    }
}

mod get_particle_emitter_3d_particle_alpha {
    use super::*;

    #[test]
    fn returns_alpha_for_a_valid_index() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), 1.0);
        set_particle_emitter_3d_particle_alpha(&mut emitter, 0, 0.5);
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), 0.5);
    }

    #[test]
    fn returns_negative_one_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), -1.0);
    }
}

mod get_particle_emitter_3d_particle_id {
    use super::*;

    #[test]
    fn returns_the_id() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 42, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_3d_particle_id(&emitter, 0), 42);
    }

    #[test]
    fn returns_negative_one_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_particle_id(&emitter, 0), -1);
    }
}

mod get_particle_emitter_3d_particle_velocity {
    use super::*;

    #[test]
    fn reads_the_full_3d_velocity() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&mut emitter, 0, 3.5, -2.1, 7.7);
        let mut out = [0.0f32; 3];
        assert!(get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0));
        assert!((out[0] - 3.5).abs() < 1e-5);
        assert!((out[1] - (-2.1)).abs() < 1e-5);
        assert!((out[2] - 7.7).abs() < 1e-5);
    }

    #[test]
    fn returns_false_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        let mut out = [0.0f32; 3];
        assert!(!get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0));
    }
}

mod remove_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn swap_removes_the_particle() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 10.0, 0.0, 5.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 2, 20.0, 0.0, 15.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 3, 30.0, 0.0, 25.0, 0.0, 1.0);
        let vt = 2 * VEL_STRIDE;
        emitter.data.velocities[vt] = 7.0;
        emitter.data.velocities[vt + 1] = 8.0;
        emitter.data.velocities[vt + 2] = 9.0;
        remove_particle_emitter_3d_particle(&mut emitter, 0);
        assert_eq!(emitter.data.particle_count, 2);
        assert_eq!(emitter.data.ids[0], 3);
        assert_eq!(emitter.data.transforms[0], 30.0);
        assert_eq!(emitter.data.positions_z[0], 25.0);
        assert!((emitter.data.velocities[2] - 9.0).abs() < 1e-5);
    }

    #[test]
    fn no_ops_on_out_of_range_index() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_3d_particle(&mut emitter, 5);
        assert_eq!(emitter.data.particle_count, 1);
    }
}

mod reserve_particle_emitter_3d {
    use super::*;

    #[test]
    fn grows_all_buffers() {
        let mut emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&mut emitter, 100);
        assert!(emitter.data.ids.len() >= 100);
        assert!(emitter.data.alphas.len() >= 100);
        assert!(emitter.data.transforms.len() >= 400);
        assert!(emitter.data.positions_z.len() >= 100);
        assert!(emitter.data.velocities.len() >= 300);
        assert!(emitter.data.colors.len() >= 300);
    }

    #[test]
    fn does_not_shrink() {
        let mut emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&mut emitter, 100);
        reserve_particle_emitter_3d(&mut emitter, 50);
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 100);
    }

    #[test]
    fn repairs_a_short_storage_lane() {
        let mut emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&mut emitter, 8);
        emitter.data.positions_z = vec![];
        emitter.data.velocities = vec![];
        reserve_particle_emitter_3d(&mut emitter, 8);
        assert!(emitter.data.positions_z.len() >= 8);
        assert!(emitter.data.velocities.len() >= 8 * 3);
    }
}

mod set_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn sets_all_transform_fields_including_z() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle(&mut emitter, 0, 7, 100.0, 200.0, 300.0, 1.5, 3.0);
        assert_eq!(emitter.data.ids[0], 7);
        let tt = 0 * T_STRIDE;
        assert_eq!(emitter.data.transforms[tt], 100.0);
        assert_eq!(emitter.data.transforms[tt + 1], 200.0);
        assert_eq!(emitter.data.transforms[tt + 2], 1.5);
        assert_eq!(emitter.data.transforms[tt + 3], 3.0);
        assert_eq!(emitter.data.positions_z[0], 300.0);
    }

    #[test]
    fn no_ops_on_out_of_range() {
        let mut emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle(&mut emitter, 0, 7, 100.0, 200.0, 300.0, 1.5, 3.0);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

mod set_particle_emitter_3d_particle_alpha {
    use super::*;

    #[test]
    fn sets_alpha_for_a_valid_index() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_alpha(&mut emitter, 0, 0.75);
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), 0.75);
    }

    #[test]
    fn no_ops_on_out_of_range() {
        let mut emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle_alpha(&mut emitter, 0, 0.5);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

mod set_particle_emitter_3d_particle_color {
    use super::*;

    #[test]
    fn sets_the_color() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_color(&mut emitter, 0, 0.2, 0.4, 0.8);
        assert!((emitter.data.colors[0] - 0.2).abs() < 1e-5);
        assert!((emitter.data.colors[1] - 0.4).abs() < 1e-5);
        assert!((emitter.data.colors[2] - 0.8).abs() < 1e-5);
    }

    #[test]
    fn no_ops_on_out_of_range() {
        let mut emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle_color(&mut emitter, 0, 0.2, 0.4, 0.8);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

mod set_particle_emitter_3d_particle_velocity {
    use super::*;

    #[test]
    fn sets_the_full_3d_velocity_for_a_valid_index() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&mut emitter, 0, 5.5, -3.2, 9.1);
        let mut out = [0.0f32; 3];
        assert!(get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0));
        assert!((out[0] - 5.5).abs() < 1e-5);
        assert!((out[1] - (-3.2)).abs() < 1e-5);
        assert!((out[2] - 9.1).abs() < 1e-5);
    }
}

mod sort_particle_emitter_3d_by_view_depth {
    use super::*;

    #[test]
    fn sorts_particles_ascending_by_view_depth() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 11, 0.0, 0.0, -10.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 12, 0.0, 0.0, -5.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 13, 0.0, 0.0, -5.0, 0.0, 1.0);
        let identity: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        sort_particle_emitter_3d_by_view_depth(&mut emitter, &identity);
        assert_eq!(emitter.data.ids[0], 11);
        assert_eq!(emitter.data.ids[3], 10);
    }

    #[test]
    fn applies_the_view_matrix() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 10, 2.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 11, -3.0, 0.0, 0.0, 0.0, 1.0);
        let mut view: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        view[2] = 1.0;
        view[10] = 0.0;
        sort_particle_emitter_3d_by_view_depth(&mut emitter, &view);
        assert_eq!(emitter.data.ids[0], 11);
        assert_eq!(emitter.data.ids[1], 10);
    }
}

mod sort_particle_emitter_3d_indices_by_view_depth {
    use super::*;

    #[test]
    fn sorts_indices_by_view_depth_without_reordering_storage() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 11, 0.0, 0.0, -10.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&mut emitter, 12, 0.0, 0.0, -5.0, 0.0, 1.0);
        let identity: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        let mut indices = vec![0u32; 3];
        let mut depths = vec![0.0f64; 3];
        let ok = sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices, &mut depths, &emitter, &identity,
        );
        assert!(ok);
        assert_eq!(indices[0], 1);
        assert_eq!(indices[2], 0);
        assert_eq!(emitter.data.ids[0], 10);
    }

    #[test]
    fn returns_false_when_output_slices_are_too_small() {
        let mut emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        let identity: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        let mut indices = vec![0u32; 0];
        let mut depths = vec![0.0f64; 0];
        assert!(!sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices, &mut depths, &emitter, &identity,
        ));
    }
}
