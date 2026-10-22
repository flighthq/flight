use flight_geometry::{create_rectangle, create_vector2};
use flight_particles::ParticleEmitter2D;
use flight_particleemitter::*;
use flight_textureatlas::{
    TextureAtlasOptions, TextureAtlasRegionOptions, TextureAtlasRotation,
    create_texture_atlas, create_texture_atlas_region,
};

fn make_atlas_region(id: i32, width: f32, height: f32) -> flight_entity::Ref<flight_textureatlas::TextureAtlasRegion> {
    return create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        id: Some(id),
        width: Some(width),
        height: Some(height),
        name: None,
        original_height: None,
        original_width: None,
        page_name: None,
        pivot_x: None,
        pivot_y: None,
        rotation: None,
        source_x: None,
        source_y: None,
        trimmed: None,
        x: None,
        y: None,
    }));
}

fn make_rotated_atlas_region(
    id: i32,
    width: f32,
    height: f32,
    rotation: TextureAtlasRotation,
) -> flight_entity::Ref<flight_textureatlas::TextureAtlasRegion> {
    return create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        id: Some(id),
        width: Some(width),
        height: Some(height),
        rotation: Some(rotation),
        name: None,
        original_height: None,
        original_width: None,
        page_name: None,
        pivot_x: None,
        pivot_y: None,
        source_x: None,
        source_y: None,
        trimmed: None,
        x: None,
        y: None,
    }));
}

fn make_atlas_with_regions(regions: Vec<flight_entity::Ref<flight_textureatlas::TextureAtlasRegion>>) -> flight_entity::Ref<flight_textureatlas::TextureAtlas> {
    return create_texture_atlas(Some(TextureAtlasOptions {
        regions: Some(regions),
        image_height: None,
        image_name: None,
        image_width: None,
        scale: None,
        texture: None,
    }));
}

mod append_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn appends_a_particle_and_returns_its_index() {
        let mut emitter = create_particle_emitter_2d();
        let idx = append_particle_emitter_2d_particle(&mut emitter, 2, 10.0, 20.0, 0.5, 1.5);
        assert_eq!(idx, 0);
        assert_eq!(emitter.data.particle_count, 1);
        assert_eq!(emitter.data.ids[0], 2);
        assert_eq!(emitter.data.transforms[0], 10.0);
        assert_eq!(emitter.data.transforms[1], 20.0);
        assert_eq!(emitter.data.transforms[2], 0.5);
        assert_eq!(emitter.data.transforms[3], 1.5);
    }

    #[test]
    fn initializes_alpha_to_1_and_color_to_white() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(emitter.data.alphas[0], 1.0);
        assert_eq!(emitter.data.colors[0], 1.0);
        assert_eq!(emitter.data.colors[1], 1.0);
        assert_eq!(emitter.data.colors[2], 1.0);
    }

    #[test]
    fn returns_sequential_indices_for_multiple_appends() {
        let mut emitter = create_particle_emitter_2d();
        assert_eq!(append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0), 0);
        assert_eq!(append_particle_emitter_2d_particle(&mut emitter, 1, 5.0, 5.0, 0.0, 1.0), 1);
        assert_eq!(emitter.data.particle_count, 2);
    }

    #[test]
    fn auto_grows_capacity() {
        let mut emitter = create_particle_emitter_2d();
        for i in 0..10 {
            append_particle_emitter_2d_particle(&mut emitter, i as u16, 0.0, 0.0, 0.0, 1.0);
        }
        assert_eq!(emitter.data.particle_count, 10);
        assert!(get_particle_emitter_2d_capacity(&emitter) >= 10);
    }
}

mod clear_particle_emitter_2d {
    use super::*;

    #[test]
    fn sets_particle_count_to_0_and_keeps_capacity() {
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 50);
        emitter.data.particle_count = 10;
        let capacity_before = get_particle_emitter_2d_capacity(&emitter);
        clear_particle_emitter_2d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 0);
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), capacity_before);
    }
}

mod clone_particle_emitter_2d {
    use super::*;

    #[test]
    fn copies_count_and_world_space_into_a_new_emitter() {
        let mut source = create_particle_emitter_2d();
        source.data.world_space = true;
        append_particle_emitter_2d_particle(&mut source, 0, 10.0, 20.0, 0.5, 2.0);
        set_particle_emitter_2d_particle_color(&mut source, 0, 0.1, 0.2, 0.3);
        set_particle_emitter_2d_particle_alpha(&mut source, 0, 0.4);
        set_particle_emitter_2d_particle_velocity(&mut source, 0, 5.0, 6.0);

        let cloned = clone_particle_emitter_2d(&source);
        assert_eq!(cloned.data.particle_count, 1);
        assert_eq!(cloned.data.world_space, true);
        assert_eq!(get_particle_emitter_2d_particle_id(&cloned, 0), 0);
        assert!((get_particle_emitter_2d_particle_alpha(&cloned, 0) - 0.4).abs() < 1e-6);
    }

    #[test]
    fn clones_arrays_so_mutations_do_not_leak_back() {
        let mut source = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut source, 1, 0.0, 0.0, 0.0, 1.0);
        let mut cloned = clone_particle_emitter_2d(&source);
        set_particle_emitter_2d_particle(&mut cloned, 0, 2, 99.0, 99.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_id(&source, 0), 1);
        assert_eq!(source.data.transforms[0], 0.0);
    }
}

mod compact_particle_emitter_2d {
    use super::*;

    #[test]
    fn no_ops_on_an_empty_emitter() {
        let mut emitter = create_particle_emitter_2d();
        compact_particle_emitter_2d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn removes_sentinel_id_entries_and_preserves_order() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 10, 1.0, 1.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&mut emitter, 11, 2.0, 2.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&mut emitter, 12, 3.0, 3.0, 0.0, 1.0);
        emitter.data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_2d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 10);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 1), 12);
        assert_eq!(emitter.data.transforms[1 * 4], 3.0);
    }

    #[test]
    fn leaves_a_fully_live_buffer_unchanged() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 1, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&mut emitter, 2, 0.0, 0.0, 0.0, 1.0);
        compact_particle_emitter_2d(&mut emitter);
        assert_eq!(emitter.data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 1);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 1), 2);
    }
}

mod compute_particle_emitter_2d_local_bounds_rectangle {
    use super::*;

    #[test]
    fn returns_zero_bounds_when_atlas_is_none() {
        let emitter = create_particle_emitter_2d();
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, None);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn returns_zero_bounds_when_particle_count_is_0() {
        let atlas_ref = make_atlas_with_regions(vec![make_atlas_region(0, 32.0, 32.0)]);
        let atlas = atlas_ref.read().unwrap();
        let emitter = create_particle_emitter_2d();
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, Some(&atlas));
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn computes_aabb_for_a_single_axis_aligned_particle() {
        let atlas_ref = make_atlas_with_regions(vec![make_atlas_region(0, 10.0, 20.0)]);
        let atlas = atlas_ref.read().unwrap();
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 1);
        emitter.data.particle_count = 1;
        emitter.data.ids[0] = 0;
        emitter.data.transforms[0] = 5.0;
        emitter.data.transforms[1] = 10.0;
        emitter.data.transforms[2] = 0.0;
        emitter.data.transforms[3] = 1.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, Some(&atlas));
        assert!((out.x - 5.0).abs() < 1e-5);
        assert!((out.y - 10.0).abs() < 1e-5);
        assert!((out.width - 10.0).abs() < 1e-5);
        assert!((out.height - 20.0).abs() < 1e-5);
    }

    #[test]
    fn uses_the_upright_logical_extent_of_a_rotated_atlas_region() {
        let region = make_rotated_atlas_region(0, 10.0, 20.0, TextureAtlasRotation::Clockwise90);
        let atlas_ref = make_atlas_with_regions(vec![region]);
        let atlas = atlas_ref.read().unwrap();
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 1);
        emitter.data.particle_count = 1;
        emitter.data.ids[0] = 0;
        emitter.data.transforms[0] = 5.0;
        emitter.data.transforms[1] = 10.0;
        emitter.data.transforms[2] = 0.0;
        emitter.data.transforms[3] = 1.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, Some(&atlas));
        assert!((out.width - 20.0).abs() < 1e-5);
        assert!((out.height - 10.0).abs() < 1e-5);
        assert!((out.x - 5.0).abs() < 1e-5);
        assert!((out.y - 10.0).abs() < 1e-5);
    }

    #[test]
    fn computes_aabb_over_multiple_particles() {
        let atlas_ref = make_atlas_with_regions(vec![make_atlas_region(0, 10.0, 10.0)]);
        let atlas = atlas_ref.read().unwrap();
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 2);
        emitter.data.particle_count = 2;
        emitter.data.ids[0] = 0;
        emitter.data.ids[1] = 0;
        emitter.data.transforms[0] = 0.0;
        emitter.data.transforms[1] = 0.0;
        emitter.data.transforms[2] = 0.0;
        emitter.data.transforms[3] = 1.0;
        emitter.data.transforms[4] = 50.0;
        emitter.data.transforms[5] = 50.0;
        emitter.data.transforms[6] = 0.0;
        emitter.data.transforms[7] = 1.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, Some(&atlas));
        assert!((out.x - 0.0).abs() < 1e-5);
        assert!((out.y - 0.0).abs() < 1e-5);
        assert!((out.width - 60.0).abs() < 1e-5);
        assert!((out.height - 60.0).abs() < 1e-5);
    }

    #[test]
    fn skips_particles_with_out_of_range_region_ids() {
        let atlas_ref = make_atlas_with_regions(vec![make_atlas_region(0, 10.0, 10.0)]);
        let atlas = atlas_ref.read().unwrap();
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 2);
        emitter.data.particle_count = 2;
        emitter.data.ids[0] = 0;
        emitter.data.ids[1] = 99;
        emitter.data.transforms[0] = 0.0;
        emitter.data.transforms[1] = 0.0;
        emitter.data.transforms[2] = 0.0;
        emitter.data.transforms[3] = 1.0;
        emitter.data.transforms[4] = 1000.0;
        emitter.data.transforms[5] = 1000.0;
        emitter.data.transforms[6] = 0.0;
        emitter.data.transforms[7] = 1.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter, Some(&atlas));
        assert!((out.width - 10.0).abs() < 1e-5);
        assert!((out.height - 10.0).abs() < 1e-5);
    }
}

mod create_particle_emitter_2d {
    use super::*;

    #[test]
    fn creates_an_empty_emitter() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(emitter.data.particle_count, 0);
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 0);
    }
}

mod create_particle_emitter_data {
    use super::*;

    #[test]
    fn creates_default_data_with_zero_count() {
        let data = create_particle_emitter_data();
        assert_eq!(data.particle_count, 0);
        assert_eq!(data.world_space, false);
    }
}

mod get_particle_emitter_2d_capacity {
    use super::*;

    #[test]
    fn returns_0_for_a_new_emitter() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 0);
    }

    #[test]
    fn returns_capacity_after_reserve() {
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 10);
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 10);
    }
}

mod get_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn returns_the_alpha_at_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_alpha(&mut emitter, 0, 0.5);
        assert!((get_particle_emitter_2d_particle_alpha(&emitter, 0) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn returns_negative_1_for_out_of_range_index() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_alpha(&emitter, 0), -1.0);
    }
}

mod get_particle_emitter_2d_particle_id {
    use super::*;

    #[test]
    fn returns_the_region_id_at_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 7, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 7);
    }

    #[test]
    fn returns_negative_1_for_out_of_range_index() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), -1);
    }
}

mod get_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn writes_velocity_into_out_for_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_velocity(&mut emitter, 0, 3.5, -1.5);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0);
        assert_eq!(result, true);
        assert!((out.x - 3.5).abs() < 1e-6);
        assert!((out.y - (-1.5)).abs() < 1e-6);
    }

    #[test]
    fn returns_false_and_does_not_write_for_out_of_range_index() {
        let emitter = create_particle_emitter_2d();
        let mut out = create_vector2(99.0, 99.0);
        assert_eq!(get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0), false);
        assert_eq!(out.x, 99.0);
        assert_eq!(out.y, 99.0);
    }
}

mod initialize_particle_emitter_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut data = create_particle_emitter_data();
        data.particle_count = 999;
        initialize_particle_emitter_data(&mut data);
        assert_eq!(data.particle_count, 0);
        assert!(data.alphas.is_empty());
        assert!(data.ids.is_empty());
        assert!(data.transforms.is_empty());
        assert_eq!(data.world_space, false);
    }
}

mod remove_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn swap_removes_with_the_last_particle() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&mut emitter, 1, 10.0, 10.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&mut emitter, 2, 20.0, 20.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&mut emitter, 0);
        assert_eq!(emitter.data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 2);
    }

    #[test]
    fn removes_the_only_particle() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 5, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&mut emitter, 0);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn no_ops_for_out_of_range_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&mut emitter, 1);
        assert_eq!(emitter.data.particle_count, 1);
    }
}

mod reserve_particle_emitter_2d {
    use super::*;

    #[test]
    fn allocates_all_arrays_when_capacity_is_larger() {
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 50);
        assert_eq!(emitter.data.ids.len(), 50);
        assert_eq!(emitter.data.alphas.len(), 50);
        assert_eq!(emitter.data.transforms.len(), 50 * 4);
    }

    #[test]
    fn does_not_reallocate_when_capacity_is_already_sufficient() {
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 50);
        let ids_ptr = emitter.data.ids.as_ptr();
        let alphas_ptr = emitter.data.alphas.as_ptr();
        reserve_particle_emitter_2d(&mut emitter, 50);
        assert_eq!(emitter.data.ids.as_ptr(), ids_ptr);
        assert_eq!(emitter.data.alphas.as_ptr(), alphas_ptr);
    }
}

mod set_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn sets_id_and_transform_for_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle(&mut emitter, 0, 3, 5.0, 10.0, 1.57, 2.0);
        assert_eq!(emitter.data.ids[0], 3);
        assert!((emitter.data.transforms[0] - 5.0).abs() < 1e-5);
        assert!((emitter.data.transforms[1] - 10.0).abs() < 1e-5);
        assert!((emitter.data.transforms[2] - 1.57).abs() < 1e-5);
        assert!((emitter.data.transforms[3] - 2.0).abs() < 1e-5);
    }

    #[test]
    fn no_ops_for_out_of_range_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.data.ids[0] = 0;
        set_particle_emitter_2d_particle(&mut emitter, 1, 9, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(emitter.data.ids[0], 0);
    }
}

mod set_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn sets_alpha_for_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_alpha(&mut emitter, 0, 0.25);
        assert!((emitter.data.alphas[0] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn no_ops_for_out_of_range_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.data.alphas[0] = 0.5;
        set_particle_emitter_2d_particle_alpha(&mut emitter, 1, 0.9);
        assert!((emitter.data.alphas[0] - 0.5).abs() < 1e-6);
    }
}

mod set_particle_emitter_2d_particle_color {
    use super::*;

    #[test]
    fn sets_r_g_b_for_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_color(&mut emitter, 0, 0.2, 0.4, 0.8);
        assert!((emitter.data.colors[0] - 0.2).abs() < 1e-6);
        assert!((emitter.data.colors[1] - 0.4).abs() < 1e-6);
        assert!((emitter.data.colors[2] - 0.8).abs() < 1e-6);
    }

    #[test]
    fn no_ops_for_out_of_range_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.data.colors[0] = 0.5;
        set_particle_emitter_2d_particle_color(&mut emitter, 1, 0.9, 0.9, 0.9);
        assert!((emitter.data.colors[0] - 0.5).abs() < 1e-6);
    }
}

mod set_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn sets_vx_and_vy_for_a_valid_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_velocity(&mut emitter, 0, 2.5, -3.0);
        assert!((emitter.data.velocities[0] - 2.5).abs() < 1e-6);
        assert!((emitter.data.velocities[1] - (-3.0)).abs() < 1e-6);
    }

    #[test]
    fn no_ops_for_out_of_range_index() {
        let mut emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&mut emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.data.velocities[0] = 1.0;
        set_particle_emitter_2d_particle_velocity(&mut emitter, 1, 9.0, 9.0);
        assert!((emitter.data.velocities[0] - 1.0).abs() < 1e-6);
    }
}
