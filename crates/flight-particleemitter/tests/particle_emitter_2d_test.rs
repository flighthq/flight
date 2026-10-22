// flight-lint: allow(test-default-call) ParticleEmitterConfigOptions is an input option bag with no create function
use flight_geometry::{create_rectangle, create_vector2};
use flight_node::{Node, NodeRef, get_node_local_bounds_rectangle, get_node_local_bounds_revision};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{ParticleEmitterConfigOptions, create_particle_emitter_config_options};

use flight_particleemitter::*;

mod append_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn appends_and_returns_index() {
        let emitter = create_particle_emitter_2d();
        let idx = append_particle_emitter_2d_particle(&emitter, 42, 10.0, 20.0, 0.5, 2.0);
        assert_eq!(idx, 0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert_eq!(guard.data.ids[0], 42);
    }

    #[test]
    fn successive_appends_increment_index() {
        let emitter = create_particle_emitter_2d();
        let a = append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        let b = append_particle_emitter_2d_particle(&emitter, 1, 1.0, 1.0, 0.0, 1.0);
        assert_eq!(a, 0);
        assert_eq!(b, 1);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
    }
}

mod clear_particle_emitter_2d {
    use super::*;

    #[test]
    fn resets_particle_count_to_zero() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 1, 1.0, 1.0, 0.0, 1.0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
        clear_particle_emitter_2d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod clone_particle_emitter_2d {
    use super::*;

    #[test]
    fn returns_a_new_node_with_independent_arrays() {
        let source = create_particle_emitter_2d();
        {
            let mut guard = source.write().unwrap();
            guard.data.particle_count = 2;
            guard.data.transforms = vec![1.0, 2.0, 0.0, 1.0, 3.0, 4.0, 0.0, 1.0];
            guard.data.colors = vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
            guard.data.alphas = vec![0.5, 0.8];
            guard.data.ids = vec![0, 1];
        }
        let cloned = clone_particle_emitter_2d(&source.read().unwrap());
        assert!(!std::sync::Arc::ptr_eq(&source, &cloned));
        let src = source.read().unwrap();
        let dst = cloned.read().unwrap();
        assert_eq!(dst.data.particle_count, src.data.particle_count);
        assert_eq!(dst.data.transforms, src.data.transforms);
        assert_eq!(dst.data.colors, src.data.colors);
        assert_eq!(dst.data.alphas, src.data.alphas);
        assert_eq!(dst.data.ids, src.data.ids);
        assert_eq!(dst.data.world_space, src.data.world_space);
    }

    #[test]
    fn mutations_on_clone_do_not_affect_source() {
        let source = create_particle_emitter_2d();
        {
            let mut guard = source.write().unwrap();
            guard.data.particle_count = 1;
            guard.data.transforms = vec![10.0, 20.0, 0.0, 1.0];
            guard.data.alphas = vec![1.0];
        }
        let cloned = clone_particle_emitter_2d(&source.read().unwrap());
        cloned.write().unwrap().data.transforms[0] = 999.0;
        assert_eq!(source.read().unwrap().data.transforms[0], 10.0);
    }

    #[test]
    fn shares_atlas_ref() {
        let source = create_particle_emitter_2d();
        let cloned = clone_particle_emitter_2d(&source.read().unwrap());
        let src = source.read().unwrap();
        let dst = cloned.read().unwrap();
        assert!(src.data.atlas.is_none());
        assert!(dst.data.atlas.is_none());
    }
}

mod clone_particle_emitter_3d {
    use super::*;

    #[test]
    fn returns_a_new_node_with_independent_arrays() {
        let source = create_particle_emitter_3d();
        {
            let mut guard = source.write().unwrap();
            guard.data.particle_count = 1;
            guard.data.transforms = vec![5.0, 6.0, 0.0, 1.0];
            guard.data.positions_z = vec![7.0];
            guard.data.alphas = vec![0.9];
            guard.data.colors = vec![1.0, 0.0, 0.0];
            guard.data.ids = vec![0];
        }
        let cloned = clone_particle_emitter_3d(&source.read().unwrap());
        assert!(!std::sync::Arc::ptr_eq(&source, &cloned));
        let src = source.read().unwrap();
        let dst = cloned.read().unwrap();
        assert_eq!(dst.data.particle_count, src.data.particle_count);
        assert_eq!(dst.data.transforms, src.data.transforms);
        assert_eq!(dst.data.positions_z, src.data.positions_z);
    }

    #[test]
    fn retains_blend_mode() {
        let source = create_particle_emitter_3d();
        let cloned = clone_particle_emitter_3d(&source.read().unwrap());
        let src = source.read().unwrap();
        let dst = cloned.read().unwrap();
        assert_eq!(dst.blend_mode, src.blend_mode);
    }

    #[test]
    fn mutations_on_clone_do_not_affect_source() {
        let source = create_particle_emitter_3d();
        {
            let mut guard = source.write().unwrap();
            guard.data.particle_count = 1;
            guard.data.transforms = vec![10.0, 20.0, 0.0, 1.0];
        }
        let cloned = clone_particle_emitter_3d(&source.read().unwrap());
        cloned.write().unwrap().data.transforms[0] = 999.0;
        assert_eq!(source.read().unwrap().data.transforms[0], 10.0);
    }
}

mod compact_particle_emitter_2d {
    use super::*;

    #[test]
    fn removes_deleted_particles() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 10, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 20, 1.0, 1.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 30, 2.0, 2.0, 0.0, 1.0);
        emitter.write().unwrap().data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_2d(&emitter);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 2);
        assert_eq!(guard.data.ids[0], 10);
        assert_eq!(guard.data.ids[1], 30);
    }
}

mod create_particle_emitter_2d {
    use super::*;

    #[test]
    fn initializes_defaults() {
        let emitter = create_particle_emitter_2d();
        let guard = emitter.read().unwrap();
        assert!(guard.data.alphas.is_empty());
        assert!(guard.data.atlas.is_none());
        assert!(guard.data.ids.is_empty());
        assert_eq!(guard.data.particle_count, 0);
        assert!(guard.data.transforms.is_empty());
        assert_eq!(guard.node_fields().kind, PARTICLE_EMITTER_2D_KIND);
    }

    #[test]
    fn returns_new_object() {
        let a = create_particle_emitter_2d();
        let b = create_particle_emitter_2d();
        assert!(!std::sync::Arc::ptr_eq(&a, &b));
    }
}

mod create_particle_emitter_2d_runtime {
    use super::*;

    #[test]
    fn installs_bounds_computation() {
        let runtime = create_particle_emitter_2d_runtime();
        let emitter = create_particle_emitter_2d();
        let mut rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut rect, &*emitter.read().unwrap());
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

mod emit_particle_burst_2d {
    use super::*;

    #[test]
    fn spawns_particles_into_emitter() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 16);
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
        let spawned = emit_particle_burst_2d(&emitter, &mut state, &config, 5.0, 0.0, 0.0, None);
        assert_eq!(spawned, 5);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }
}

mod get_particle_emitter_2d_capacity {
    use super::*;

    #[test]
    fn returns_zero_for_fresh_emitter() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 0);
    }

    #[test]
    fn returns_reserved_capacity() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 10);
        assert!(get_particle_emitter_2d_capacity(&emitter) >= 10);
    }
}

mod get_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn returns_initial_alpha() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_alpha(&emitter, 0), 1.0);
    }

    #[test]
    fn returns_negative_one_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_alpha(&emitter, 0), -1.0);
    }
}

mod get_particle_emitter_2d_particle_id {
    use super::*;

    #[test]
    fn returns_assigned_id() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 42, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 42);
    }

    #[test]
    fn returns_negative_one_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), -1);
    }
}

mod get_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn returns_default_zero_velocity() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        let mut out = create_vector2(99.0, 99.0);
        let ok = get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0);
        assert!(ok);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn returns_false_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        let mut out = create_vector2(0.0, 0.0);
        assert!(!get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0));
    }
}

mod get_particle_emitter_2d_runtime {
    use super::*;

    #[test]
    fn returns_non_null() {
        let emitter = create_particle_emitter_2d();
        let guard = emitter.read().unwrap();
        let _runtime = get_particle_emitter_2d_runtime(&*guard);
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

mod remove_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn removes_by_swap_with_last() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 10, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 20, 1.0, 1.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 30, 2.0, 2.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&emitter, 0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 2);
        assert_eq!(guard.data.ids[0], 30);
        assert_eq!(guard.data.ids[1], 20);
    }

    #[test]
    fn noop_on_empty() {
        let emitter = create_particle_emitter_2d();
        remove_particle_emitter_2d_particle(&emitter, 0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod reserve_particle_emitter_2d {
    use super::*;

    #[test]
    fn grows_capacity() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 20);
        assert!(get_particle_emitter_2d_capacity(&emitter) >= 20);
    }

    #[test]
    fn noop_when_already_sufficient() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 10);
        let before = get_particle_emitter_2d_capacity(&emitter);
        reserve_particle_emitter_2d(&emitter, 5);
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), before);
    }
}

mod set_particle_emitter_2d_local_bounds_rectangle {
    use super::*;

    #[test]
    fn makes_get_reflect_new_bounds() {
        let emitter = create_particle_emitter_2d();
        let node_ref: NodeRef = emitter.clone();
        let rect = create_rectangle(10.0, 20.0, 32.0, 16.0);
        set_particle_emitter_2d_local_bounds_rectangle(&node_ref, &rect);
        let local = get_node_local_bounds_rectangle(&node_ref);
        assert_eq!(local.x, 10.0);
        assert_eq!(local.y, 20.0);
        assert_eq!(local.width, 32.0);
        assert_eq!(local.height, 16.0);
    }

    #[test]
    fn copies_rect() {
        let emitter = create_particle_emitter_2d();
        let node_ref: NodeRef = emitter.clone();
        let mut rect = create_rectangle(10.0, 20.0, 32.0, 16.0);
        set_particle_emitter_2d_local_bounds_rectangle(&node_ref, &rect);
        rect.width = 999.0;
        let local = get_node_local_bounds_rectangle(&node_ref);
        assert_eq!(local.width, 32.0);
    }

    #[test]
    fn invalidates_revision() {
        let emitter = create_particle_emitter_2d();
        let node_ref: NodeRef = emitter.clone();
        let before = get_node_local_bounds_revision(&*emitter.read().unwrap());
        let rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
        set_particle_emitter_2d_local_bounds_rectangle(&node_ref, &rect);
        let after = get_node_local_bounds_revision(&*emitter.read().unwrap());
        assert_ne!(before, after);
    }
}

mod set_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn overwrites_position_and_id() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle(&emitter, 0, 99, 5.0, 10.0, 1.0, 2.0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.ids[0], 99);
        assert_eq!(guard.data.transforms[0], 5.0);
        assert_eq!(guard.data.transforms[1], 10.0);
        assert_eq!(guard.data.transforms[2], 1.0);
        assert_eq!(guard.data.transforms[3], 2.0);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        set_particle_emitter_2d_particle(&emitter, 0, 99, 5.0, 10.0, 1.0, 2.0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

mod set_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn sets_alpha_value() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_alpha(&emitter, 0, 0.5);
        assert_eq!(get_particle_emitter_2d_particle_alpha(&emitter, 0), 0.5);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        set_particle_emitter_2d_particle_alpha(&emitter, 0, 0.5);
    }
}

mod set_particle_emitter_2d_particle_color {
    use super::*;

    #[test]
    fn sets_color_components() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_color(&emitter, 0, 0.2, 0.4, 0.6);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.colors[0], 0.2);
        assert_eq!(guard.data.colors[1], 0.4);
        assert_eq!(guard.data.colors[2], 0.6);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        set_particle_emitter_2d_particle_color(&emitter, 0, 0.2, 0.4, 0.6);
    }
}

mod set_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn sets_velocity_components() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_velocity(&emitter, 0, 3.0, 4.0);
        let mut out = create_vector2(0.0, 0.0);
        get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        set_particle_emitter_2d_particle_velocity(&emitter, 0, 3.0, 4.0);
    }
}
