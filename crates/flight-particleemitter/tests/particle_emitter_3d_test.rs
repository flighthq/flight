// flight-lint: allow(test-default-call) ParticleEmitterConfigOptions is an input option bag with no create function
use flight_geometry::{create_aabb, create_matrix4};
use flight_node::Node;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{ParticleEmitterConfigOptions, create_particle_emitter_config_options};

use flight_particleemitter::*;

mod append_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn sets_z_coordinate_and_transform() {
        let emitter = create_particle_emitter_3d();
        let index = append_particle_emitter_3d_particle(&emitter, 5, 10.0, 20.0, 30.0, 0.5, 2.0);
        assert_eq!(index, 0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert_eq!(guard.data.ids[0], 5);
        assert_eq!(guard.data.transforms[0], 10.0);
        assert_eq!(guard.data.transforms[1], 20.0);
        assert_eq!(guard.data.transforms[2], 0.5);
        assert_eq!(guard.data.transforms[3], 2.0);
        assert_eq!(guard.data.positions_z[0], 30.0);
        assert_eq!(guard.data.alphas[0], 1.0);
    }

    #[test]
    fn auto_grows_capacity() {
        let emitter = create_particle_emitter_3d();
        for i in 0..20 {
            append_particle_emitter_3d_particle(
                &emitter, i, i as f32, i as f32, i as f32, 0.0, 1.0,
            );
        }
        assert_eq!(emitter.read().unwrap().data.particle_count, 20);
        assert!(get_particle_emitter_3d_capacity(&emitter) >= 20);
    }
}

mod clear_particle_emitter_3d {
    use super::*;

    #[test]
    fn resets_particle_count() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 2, 0.0, 0.0, 0.0, 0.0, 1.0);
        clear_particle_emitter_3d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod clone_particle_emitter_3d {
    use super::*;

    #[test]
    fn deep_copies_buffers_and_preserves_world_space() {
        let emitter = create_particle_emitter_3d();
        emitter.write().unwrap().data.world_space = true;
        append_particle_emitter_3d_particle(&emitter, 7, 1.0, 2.0, 3.0, 0.5, 2.0);
        set_particle_emitter_3d_particle_velocity(&emitter, 0, 4.0, 5.0, 6.0);
        let clone = clone_particle_emitter_3d(&emitter.read().unwrap());
        {
            let guard = clone.read().unwrap();
            assert_eq!(guard.data.world_space, true);
            assert_eq!(guard.data.particle_count, 1);
            assert_eq!(guard.data.transforms[0], 1.0);
            assert_eq!(guard.data.positions_z[0], 3.0);
        }
        let mut out = [0.0f32; 3];
        get_particle_emitter_3d_particle_velocity(&mut out, &clone, 0);
        assert!((out[2] - 6.0).abs() < 1e-6);
    }

    #[test]
    fn buffers_are_independent() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 7, 1.0, 2.0, 3.0, 0.5, 2.0);
        let clone = clone_particle_emitter_3d(&emitter.read().unwrap());
        clone.write().unwrap().data.transforms[0] = 99.0;
        assert_eq!(emitter.read().unwrap().data.transforms[0], 1.0);
    }
}

mod compact_particle_emitter_3d {
    use super::*;

    #[test]
    fn removes_deleted_preserves_order() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 10.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 2, 20.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 3, 30.0, 0.0, 0.0, 0.0, 1.0);
        emitter.write().unwrap().data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_3d(&emitter);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 2);
        assert_eq!(guard.data.ids[0], 1);
        assert_eq!(guard.data.ids[1], 3);
        assert_eq!(guard.data.transforms[0], 10.0);
        assert_eq!(guard.data.transforms[4], 30.0);
    }

    #[test]
    fn carries_z_velocity_lane() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 2, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&emitter, 1, 4.0, 5.0, 6.0);
        emitter.write().unwrap().data.ids[0] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_3d(&emitter);
        let mut out = [0.0f32; 3];
        get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0);
        assert!((out[0] - 4.0).abs() < 1e-6);
        assert!((out[1] - 5.0).abs() < 1e-6);
        assert!((out[2] - 6.0).abs() < 1e-6);
    }

    #[test]
    fn noop_on_empty() {
        let emitter = create_particle_emitter_3d();
        compact_particle_emitter_3d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod compute_particle_emitter_3d_local_bounds_aabb {
    use super::*;

    #[test]
    fn empty_for_no_particles() {
        let emitter = create_particle_emitter_3d();
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_3d_local_bounds_aabb(&mut out, &emitter);
        assert_eq!(out.min.x, 0.0);
        assert_eq!(out.max.z, 0.0);
    }

    #[test]
    fn expands_by_billboard_radius() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 2.0);
        append_particle_emitter_3d_particle(&emitter, 2, 10.0, -4.0, 6.0, 0.0, 2.0);
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_3d_local_bounds_aabb(&mut out, &emitter);
        let r = std::f32::consts::FRAC_1_SQRT_2 * 2.0;
        assert!((out.min.x - (-r)).abs() < 1e-5);
        assert!((out.min.y - (-4.0 - r)).abs() < 1e-5);
        assert!((out.min.z - (-r)).abs() < 1e-5);
        assert!((out.max.x - (10.0 + r)).abs() < 1e-5);
        assert!((out.max.y - r).abs() < 1e-5);
        assert!((out.max.z - (6.0 + r)).abs() < 1e-5);
    }
}

mod create_particle_emitter_3d {
    use super::*;

    #[test]
    fn kind_and_defaults() {
        let emitter = create_particle_emitter_3d();
        let guard = emitter.read().unwrap();
        assert_eq!(guard.node_fields().kind, PARTICLE_EMITTER_3D_KIND);
        assert_eq!(guard.data.particle_count, 0);
        assert_eq!(guard.data.world_space, false);
    }

    #[test]
    fn blend_mode_defaults_to_normal() {
        let emitter = create_particle_emitter_3d();
        let guard = emitter.read().unwrap();
        assert_eq!(guard.blend_mode.as_deref(), Some("normal"));
    }

    #[test]
    fn is_a_scene_node() {
        let emitter = create_particle_emitter_3d();
        let guard = emitter.read().unwrap();
        assert_eq!(guard.node_fields().kind, PARTICLE_EMITTER_3D_KIND);
    }
}

mod emit_particle_burst_3d {
    use super::*;

    #[test]
    fn spawns_particles_into_emitter() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 16);
        let mut state = create_particle_emitter_state();
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(100.0),
            max_particles: Some(100.0),
            lifetime_min: Some(1.0),
            lifetime_max: Some(1.0),
            speed_min: Some(10.0),
            speed_max: Some(10.0),
            alpha_end: Some(1.0),
            looping: Some(false),
            ..create_particle_emitter_config_options()
        }));
        let spawned =
            emit_particle_burst_3d(&emitter, &mut state, &config, 5.0, 0.0, 0.0, 0.0, None);
        assert_eq!(spawned, 5);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }
}

mod get_particle_emitter_3d_capacity {
    use super::*;

    #[test]
    fn returns_zero_for_fresh() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 0);
    }

    #[test]
    fn after_reserve() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 64);
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 64);
    }

    #[test]
    fn bounded_by_every_lane() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 8);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.positions_z = vec![0.0; 3];
            guard.data.colors = vec![0.0; 2 * 3];
        }
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 2);
    }
}

mod get_particle_emitter_3d_particle_alpha {
    use super::*;

    #[test]
    fn returns_value_for_valid_index() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_alpha(&emitter, 0, 0.5);
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), 0.5);
    }

    #[test]
    fn returns_neg1_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_particle_alpha(&emitter, 0), -1.0);
    }
}

mod get_particle_emitter_3d_particle_id {
    use super::*;

    #[test]
    fn returns_value() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 42, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_3d_particle_id(&emitter, 0), 42);
    }

    #[test]
    fn returns_neg1_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        assert_eq!(get_particle_emitter_3d_particle_id(&emitter, 5), -1);
    }
}

mod get_particle_emitter_3d_particle_velocity {
    use super::*;

    #[test]
    fn writes_full_3d_velocity() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&emitter, 0, 3.5, -2.1, 7.7);
        let mut out = [0.0f32; 3];
        assert_eq!(
            get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0),
            true
        );
        assert!((out[0] - 3.5).abs() < 1e-6);
        assert!((out[1] - (-2.1)).abs() < 1e-6);
        assert!((out[2] - 7.7).abs() < 1e-6);
    }

    #[test]
    fn returns_false_for_out_of_range() {
        let emitter = create_particle_emitter_3d();
        let mut out = [0.0f32; 3];
        assert_eq!(
            get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0),
            false
        );
    }
}

mod get_particle_emitter_3d_runtime {
    use super::*;

    #[test]
    fn returns_defined() {
        let emitter = create_particle_emitter_3d();
        let guard = emitter.read().unwrap();
        let _runtime = get_particle_emitter_3d_runtime(&*guard);
    }
}

mod is_particle_emitter_3d {
    use super::*;

    #[test]
    fn returns_true_for_3d_emitter() {
        let emitter = create_particle_emitter_3d();
        let guard = emitter.read().unwrap();
        assert_eq!(is_particle_emitter_3d(&*guard), true);
    }

    #[test]
    fn returns_false_for_2d_emitter() {
        let emitter = create_particle_emitter_2d();
        let guard = emitter.read().unwrap();
        assert_eq!(is_particle_emitter_3d(&*guard), false);
    }
}

mod remove_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn swap_removes() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 10.0, 0.0, 5.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 2, 20.0, 0.0, 15.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 3, 30.0, 0.0, 25.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&emitter, 2, 7.0, 8.0, 9.0);
        remove_particle_emitter_3d_particle(&emitter, 0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 2);
        assert_eq!(guard.data.ids[0], 3);
        assert_eq!(guard.data.transforms[0], 30.0);
        assert_eq!(guard.data.positions_z[0], 25.0);
        drop(guard);
        let mut out = [0.0f32; 3];
        get_particle_emitter_3d_particle_velocity(&mut out, &emitter, 0);
        assert!((out[2] - 9.0).abs() < 1e-6);
    }

    #[test]
    fn noop_on_out_of_range() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_3d_particle(&emitter, 5);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
    }
}

mod reserve_particle_emitter_3d {
    use super::*;

    #[test]
    fn grows_all_buffers() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 100);
        let guard = emitter.read().unwrap();
        assert!(guard.data.ids.len() >= 100);
        assert!(guard.data.alphas.len() >= 100);
        assert!(guard.data.transforms.len() >= 400);
        assert!(guard.data.positions_z.len() >= 100);
        assert!(guard.data.velocities.len() >= 300);
        assert!(guard.data.colors.len() >= 300);
    }

    #[test]
    fn does_not_shrink() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 100);
        reserve_particle_emitter_3d(&emitter, 50);
        assert_eq!(get_particle_emitter_3d_capacity(&emitter), 100);
    }

    #[test]
    fn repairs_short_storage_lane() {
        let emitter = create_particle_emitter_3d();
        reserve_particle_emitter_3d(&emitter, 8);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.positions_z = Vec::new();
            guard.data.velocities = Vec::new();
        }
        reserve_particle_emitter_3d(&emitter, 8);
        let guard = emitter.read().unwrap();
        assert!(guard.data.positions_z.len() >= 8);
        assert!(guard.data.velocities.len() >= 8 * 3);
    }
}

mod set_particle_emitter_3d_particle {
    use super::*;

    #[test]
    fn sets_all_transform_fields() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 0, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle(&emitter, 0, 7, 100.0, 200.0, 300.0, 1.5, 3.0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.ids[0], 7);
        assert_eq!(guard.data.transforms[0], 100.0);
        assert_eq!(guard.data.transforms[1], 200.0);
        assert_eq!(guard.data.transforms[2], 1.5);
        assert_eq!(guard.data.transforms[3], 3.0);
        assert_eq!(guard.data.positions_z[0], 300.0);
    }

    #[test]
    fn noop_on_out_of_range() {
        let emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle(&emitter, 0, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod set_particle_emitter_3d_particle_alpha {
    use super::*;

    #[test]
    fn sets_for_valid_index() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_alpha(&emitter, 0, 0.75);
        assert_eq!(emitter.read().unwrap().data.alphas[0], 0.75);
    }

    #[test]
    fn noop_on_out_of_range() {
        let emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle_alpha(&emitter, 0, 0.5);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod set_particle_emitter_3d_particle_color {
    use super::*;

    #[test]
    fn sets_color() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_color(&emitter, 0, 0.2, 0.4, 0.8);
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 0.2).abs() < 1e-6);
        assert!((guard.data.colors[1] - 0.4).abs() < 1e-6);
        assert!((guard.data.colors[2] - 0.8).abs() < 1e-6);
    }
}

mod set_particle_emitter_3d_particle_velocity {
    use super::*;

    #[test]
    fn sets_for_valid_index() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 1, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_3d_particle_velocity(&emitter, 0, 5.5, -3.2, 9.1);
        let guard = emitter.read().unwrap();
        assert!((guard.data.velocities[0] - 5.5).abs() < 1e-6);
        assert!((guard.data.velocities[1] - (-3.2)).abs() < 1e-6);
        assert!((guard.data.velocities[2] - 9.1).abs() < 1e-6);
    }

    #[test]
    fn noop_on_out_of_range() {
        let emitter = create_particle_emitter_3d();
        set_particle_emitter_3d_particle_velocity(&emitter, 0, 1.0, 2.0, 3.0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod sort_particle_emitter_3d_by_view_depth {
    use super::*;

    #[test]
    fn sorts_storage_in_place() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 11, 0.0, 0.0, -10.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 12, 0.0, 0.0, -5.0, 0.0, 1.0);
        let mat = create_matrix4();
        sort_particle_emitter_3d_by_view_depth(&emitter, &mat.m);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.ids[0], 11);
        assert_eq!(guard.data.ids[1], 12);
        assert_eq!(guard.data.ids[2], 10);
    }
}

mod sort_particle_emitter_3d_indices_by_view_depth {
    use super::*;

    #[test]
    fn sorts_back_to_front_without_reordering_storage() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 11, 0.0, 0.0, -10.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 12, 0.0, 0.0, -5.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 13, 0.0, 0.0, -5.0, 0.0, 1.0);
        let mut indices = vec![0u32; 4];
        let mut depths = vec![0.0f64; 4];
        let mat = create_matrix4();
        let result = sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices,
            &mut depths,
            &emitter,
            &mat.m,
        );
        assert_eq!(result, true);
        assert_eq!(indices, vec![1, 2, 3, 0]);
        let guard = emitter.read().unwrap();
        assert_eq!(&guard.data.ids[..4], &[10, 11, 12, 13]);
    }

    #[test]
    fn applies_position_to_view_matrix() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 10, 2.0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 11, -3.0, 0.0, 0.0, 0.0, 1.0);
        let mut position_to_view = create_matrix4();
        position_to_view.m[2] = 1.0;
        position_to_view.m[10] = 0.0;
        let mut indices = vec![0u32; 2];
        let mut depths = vec![0.0f64; 2];
        sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices,
            &mut depths,
            &emitter,
            &position_to_view.m,
        );
        assert_eq!(indices, vec![1, 0]);
    }

    #[test]
    fn returns_false_when_scratch_too_small() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        append_particle_emitter_3d_particle(&emitter, 11, 0.0, 0.0, -10.0, 0.0, 1.0);
        let mut indices = vec![99u32; 1];
        let mut depths = vec![88.0f64, 77.0];
        let mat = create_matrix4();
        let result = sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices,
            &mut depths,
            &emitter,
            &mat.m,
        );
        assert_eq!(result, false);
        assert_eq!(indices, vec![99]);
        assert_eq!(depths, vec![88.0, 77.0]);
    }

    #[test]
    fn rejects_incomplete_particle_storage() {
        let emitter = create_particle_emitter_3d();
        append_particle_emitter_3d_particle(&emitter, 10, 0.0, 0.0, -2.0, 0.0, 1.0);
        emitter.write().unwrap().data.positions_z = Vec::new();
        let mut indices = vec![99u32; 1];
        let mut depths = vec![88.0f64; 1];
        let mat = create_matrix4();
        let result = sort_particle_emitter_3d_indices_by_view_depth(
            &mut indices,
            &mut depths,
            &emitter,
            &mat.m,
        );
        assert_eq!(result, false);
        assert_eq!(indices, vec![99]);
        assert_eq!(depths, vec![88.0]);
    }
}
