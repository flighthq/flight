use flight_geometry::{create_rectangle, create_vector2};
use flight_node::{Node, NodeRef, get_node_local_bounds_rectangle, get_node_local_bounds_revision};
use flight_textureatlas::{
    TextureAtlasRegionOptions, TextureAtlasRotation,
    create_texture_atlas, create_texture_atlas_region, set_texture_atlas_region,
};

use flight_particleemitter::*;

fn make_atlas_region(
    id: i32,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) -> flight_entity::Ref<flight_textureatlas::TextureAtlasRegion> {
    let region = create_texture_atlas_region();
    set_texture_atlas_region(&mut region.write().unwrap(), &TextureAtlasRegionOptions {
        height: Some(height),
        id: Some(id),
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
        x: Some(x),
        y: Some(y),
        width: Some(width),
    });
    return region;
}

fn make_atlas(
    regions: Vec<flight_entity::Ref<flight_textureatlas::TextureAtlasRegion>>,
) -> flight_entity::Ref<flight_textureatlas::TextureAtlas> {
    let atlas = create_texture_atlas();
    atlas.write().unwrap().regions = regions;
    return atlas;
}

mod append_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn returns_index_and_sets_transform() {
        let emitter = create_particle_emitter_2d();
        let idx = append_particle_emitter_2d_particle(&emitter, 2, 10.0, 20.0, 0.5, 1.5);
        assert_eq!(idx, 0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert_eq!(guard.data.ids[0], 2);
        assert_eq!(guard.data.transforms[0], 10.0);
        assert_eq!(guard.data.transforms[1], 20.0);
        assert_eq!(guard.data.transforms[2], 0.5);
        assert_eq!(guard.data.transforms[3], 1.5);
    }

    #[test]
    fn initializes_alpha_and_color() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.alphas[0], 1.0);
        assert_eq!(guard.data.colors[0], 1.0);
        assert_eq!(guard.data.colors[1], 1.0);
        assert_eq!(guard.data.colors[2], 1.0);
    }

    #[test]
    fn returns_sequential_indices() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0), 0);
        assert_eq!(append_particle_emitter_2d_particle(&emitter, 1, 5.0, 5.0, 0.0, 1.0), 1);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
    }

    #[test]
    fn auto_grows_capacity() {
        let emitter = create_particle_emitter_2d();
        for i in 0..10 {
            append_particle_emitter_2d_particle(&emitter, i, 0.0, 0.0, 0.0, 1.0);
        }
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
        assert!(get_particle_emitter_2d_capacity(&emitter) >= 10);
    }
}

mod clear_particle_emitter_2d {
    use super::*;

    #[test]
    fn sets_count_to_zero_keeps_capacity() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 50);
        emitter.write().unwrap().data.particle_count = 10;
        let capacity_before = get_particle_emitter_2d_capacity(&emitter);
        clear_particle_emitter_2d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), capacity_before);
    }
}

mod clone_particle_emitter_2d {
    use super::*;

    #[test]
    fn copies_count_atlas_and_world_space() {
        let atlas = make_atlas(vec![make_atlas_region(0, 0.0, 0.0, 32.0, 32.0)]);
        let source = create_particle_emitter_2d();
        {
            let mut guard = source.write().unwrap();
            guard.data.atlas = Some(atlas.clone());
            guard.data.world_space = true;
        }
        append_particle_emitter_2d_particle(&source, 0, 10.0, 20.0, 0.5, 2.0);
        set_particle_emitter_2d_particle_color(&source, 0, 0.1, 0.2, 0.3);
        set_particle_emitter_2d_particle_alpha(&source, 0, 0.4);
        set_particle_emitter_2d_particle_velocity(&source, 0, 5.0, 6.0);

        let clone = clone_particle_emitter_2d(&source.read().unwrap());
        {
            let guard = clone.read().unwrap();
            assert_eq!(guard.data.particle_count, 1);
            assert!(guard.data.atlas.is_some());
            assert_eq!(guard.data.world_space, true);
        }
        assert_eq!(get_particle_emitter_2d_particle_id(&clone, 0), 0);
        let alpha = get_particle_emitter_2d_particle_alpha(&clone, 0);
        assert!((alpha - 0.4).abs() < 1e-6);
    }

    #[test]
    fn makes_independent_buffers() {
        let source = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&source, 1, 0.0, 0.0, 0.0, 1.0);
        let clone = clone_particle_emitter_2d(&source.read().unwrap());
        set_particle_emitter_2d_particle(&clone, 0, 2, 99.0, 99.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_id(&source, 0), 1);
        assert_eq!(source.read().unwrap().data.transforms[0], 0.0);
    }
}

mod compact_particle_emitter_2d {
    use super::*;

    #[test]
    fn noop_on_empty() {
        let emitter = create_particle_emitter_2d();
        compact_particle_emitter_2d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }

    #[test]
    fn removes_deleted_preserves_order() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 10, 1.0, 1.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 11, 2.0, 2.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 12, 3.0, 3.0, 0.0, 1.0);
        emitter.write().unwrap().data.ids[1] = PARTICLE_EMITTER_DELETED_ID;
        compact_particle_emitter_2d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 10);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 1), 12);
        assert_eq!(emitter.read().unwrap().data.transforms[1 * 4], 3.0);
    }

    #[test]
    fn leaves_fully_live_buffer_unchanged() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 1, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 2, 0.0, 0.0, 0.0, 1.0);
        compact_particle_emitter_2d(&emitter);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 1);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 1), 2);
    }
}

mod compute_particle_emitter_2d_local_bounds_rectangle {
    use super::*;
    fn make_emitter_with_data_and_atlas(
        mut data: ParticleEmitterData,
        atlas: Option<flight_entity::Ref<flight_textureatlas::TextureAtlas>>,
    ) -> flight_entity::Ref<ParticleEmitter2D> {
        data.atlas = atlas;
        let emitter = create_particle_emitter_2d();
        emitter.write().unwrap().data = data;
        return emitter;
    }

    #[test]
    fn returns_zero_when_atlas_is_none() {
        let emitter = make_emitter_with_data_and_atlas(create_particle_emitter_data(), None);
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn returns_zero_when_particle_count_is_zero() {
        let atlas = make_atlas(vec![make_atlas_region(0, 0.0, 0.0, 32.0, 32.0)]);
        let emitter = make_emitter_with_data_and_atlas(create_particle_emitter_data(), Some(atlas));
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn computes_aabb_for_single_axis_aligned_particle() {
        let atlas = make_atlas(vec![make_atlas_region(0, 0.0, 0.0, 10.0, 20.0)]);
        let mut data = create_particle_emitter_data();
        data.ids = vec![0];
        data.transforms = vec![5.0, 10.0, 0.0, 1.0];
        data.particle_count = 1;
        let emitter = make_emitter_with_data_and_atlas(data, Some(atlas));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert!((out.x - 5.0).abs() < 1e-5);
        assert!((out.y - 10.0).abs() < 1e-5);
        assert!((out.width - 10.0).abs() < 1e-5);
        assert!((out.height - 20.0).abs() < 1e-5);
    }

    #[test]
    fn uses_upright_extent_of_rotated_atlas_region() {
        let region = create_texture_atlas_region();
        set_texture_atlas_region(&mut region.write().unwrap(), &TextureAtlasRegionOptions {
            height: Some(20.0),
            id: Some(0),
            name: None,
            original_height: None,
            original_width: None,
            page_name: None,
            pivot_x: None,
            pivot_y: None,
            rotation: Some(TextureAtlasRotation::Clockwise90),
            source_x: None,
            source_y: None,
            trimmed: None,
            x: Some(0.0),
            y: Some(0.0),
            width: Some(10.0),
        });
        let atlas = create_texture_atlas();
        atlas.write().unwrap().regions = vec![region];
        let mut data = create_particle_emitter_data();
        data.ids = vec![0];
        data.transforms = vec![5.0, 10.0, 0.0, 1.0];
        data.particle_count = 1;
        let emitter = make_emitter_with_data_and_atlas(data, Some(atlas));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert!((out.width - 20.0).abs() < 1e-5);
        assert!((out.height - 10.0).abs() < 1e-5);
    }

    #[test]
    fn computes_aabb_over_multiple_particles() {
        let atlas = make_atlas(vec![make_atlas_region(0, 0.0, 0.0, 10.0, 10.0)]);
        let mut data = create_particle_emitter_data();
        data.ids = vec![0, 0];
        data.transforms = vec![0.0, 0.0, 0.0, 1.0, 50.0, 50.0, 0.0, 1.0];
        data.particle_count = 2;
        let emitter = make_emitter_with_data_and_atlas(data, Some(atlas));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert!((out.x - 0.0).abs() < 1e-5);
        assert!((out.y - 0.0).abs() < 1e-5);
        assert!((out.width - 60.0).abs() < 1e-5);
        assert!((out.height - 60.0).abs() < 1e-5);
    }

    #[test]
    fn skips_particles_with_out_of_range_region_ids() {
        let atlas = make_atlas(vec![make_atlas_region(0, 0.0, 0.0, 10.0, 10.0)]);
        let mut data = create_particle_emitter_data();
        data.ids = vec![0, 99];
        data.transforms = vec![0.0, 0.0, 0.0, 1.0, 1000.0, 1000.0, 0.0, 1.0];
        data.particle_count = 2;
        let emitter = make_emitter_with_data_and_atlas(data, Some(atlas));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_particle_emitter_2d_local_bounds_rectangle(&mut out, &emitter.read().unwrap());
        assert!((out.width - 10.0).abs() < 1e-5);
        assert!((out.height - 10.0).abs() < 1e-5);
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

mod create_particle_emitter_data {
    use super::*;

    #[test]
    fn returns_empty_default() {
        let data = create_particle_emitter_data();
        assert_eq!(data.particle_count, 0);
        assert!(data.alphas.is_empty());
        assert!(data.ids.is_empty());
        assert!(data.transforms.is_empty());
        assert!(data.atlas.is_none());
        assert_eq!(data.world_space, false);
    }
}

mod get_particle_emitter_2d_capacity {
    use super::*;

    #[test]
    fn returns_zero_for_new_emitter() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 0);
    }

    #[test]
    fn returns_minimum_across_arrays() {
        let emitter = create_particle_emitter_2d();
        {
            let mut guard = emitter.write().unwrap();
            guard.data.ids = vec![0; 10];
            guard.data.alphas = vec![0.0; 20];
            guard.data.transforms = vec![0.0; 10 * 4];
        }
        assert_eq!(get_particle_emitter_2d_capacity(&emitter), 10);
    }
}

mod get_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn returns_value_at_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_alpha(&emitter, 0, 0.5);
        let alpha = get_particle_emitter_2d_particle_alpha(&emitter, 0);
        assert!((alpha - 0.5).abs() < 1e-6);
    }

    #[test]
    fn returns_neg1_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_alpha(&emitter, 0), -1.0);
    }
}

mod get_particle_emitter_2d_particle_id {
    use super::*;

    #[test]
    fn returns_region_id_at_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 7, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 7);
    }

    #[test]
    fn returns_neg1_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), -1);
    }
}

mod get_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn writes_into_out_for_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_velocity(&emitter, 0, 3.5, -1.5);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0);
        assert_eq!(result, true);
        assert!((out.x - 3.5).abs() < 1e-6);
        assert!((out.y - (-1.5)).abs() < 1e-6);
    }

    #[test]
    fn returns_false_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        let mut out = create_vector2(99.0, 99.0);
        assert_eq!(get_particle_emitter_2d_particle_velocity(&mut out, &emitter, 0), false);
        assert_eq!(out.x, 99.0);
        assert_eq!(out.y, 99.0);
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

mod initialize_particle_emitter_data {
    use super::*;

    #[test]
    fn initializes_from_none_to_defaults() {
        let mut out = create_particle_emitter_data();
        out.particle_count = 42;
        initialize_particle_emitter_data(&mut out, None);
        assert_eq!(out.particle_count, 0);
        assert!(out.alphas.is_empty());
        assert!(out.ids.is_empty());
        assert!(out.transforms.is_empty());
        assert!(out.colors.is_empty());
        assert!(out.velocities.is_empty());
        assert!(out.positions_z.is_empty());
        assert!(out.atlas.is_none());
        assert_eq!(out.world_space, false);
    }

    #[test]
    fn copies_fields_from_source() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 7, 1.0, 2.0, 0.5, 1.0);
        let source = emitter.read().unwrap();
        let mut out = create_particle_emitter_data();
        initialize_particle_emitter_data(&mut out, Some(&source.data));
        assert_eq!(out.particle_count, 1);
        assert_eq!(out.ids[0], 7);
        assert!((out.transforms[0] - 1.0).abs() < 1e-6);
    }
}

mod remove_particle_emitter_2d_particle {
    use super::*;

    #[test]
    fn swap_removes_with_last() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 1, 10.0, 10.0, 0.0, 1.0);
        append_particle_emitter_2d_particle(&emitter, 2, 20.0, 20.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&emitter, 0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 2);
        assert_eq!(get_particle_emitter_2d_particle_id(&emitter, 0), 2);
    }

    #[test]
    fn removes_the_only_particle() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 5, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&emitter, 0);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        remove_particle_emitter_2d_particle(&emitter, 1);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
    }
}

mod reserve_particle_emitter_2d {
    use super::*;

    #[test]
    fn allocates_all_arrays() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 50);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.ids.len(), 50);
        assert_eq!(guard.data.alphas.len(), 50);
        assert_eq!(guard.data.transforms.len(), 50 * 4);
    }

    #[test]
    fn does_not_reallocate_when_sufficient() {
        let emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&emitter, 50);
        let ids_ptr = emitter.read().unwrap().data.ids.as_ptr();
        let alphas_ptr = emitter.read().unwrap().data.alphas.as_ptr();
        let transforms_ptr = emitter.read().unwrap().data.transforms.as_ptr();
        reserve_particle_emitter_2d(&emitter, 50);
        assert_eq!(emitter.read().unwrap().data.ids.as_ptr(), ids_ptr);
        assert_eq!(emitter.read().unwrap().data.alphas.as_ptr(), alphas_ptr);
        assert_eq!(emitter.read().unwrap().data.transforms.as_ptr(), transforms_ptr);
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
    fn sets_id_and_transform() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle(&emitter, 0, 3, 5.0, 10.0, 1.57, 2.0);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.ids[0], 3);
        assert!((guard.data.transforms[0] - 5.0).abs() < 1e-5);
        assert!((guard.data.transforms[1] - 10.0).abs() < 1e-5);
        assert!((guard.data.transforms[2] - 1.57).abs() < 1e-5);
        assert!((guard.data.transforms[3] - 2.0).abs() < 1e-5);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.write().unwrap().data.ids[0] = 0;
        set_particle_emitter_2d_particle(&emitter, 1, 9, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(emitter.read().unwrap().data.ids[0], 0);
    }
}

mod set_particle_emitter_2d_particle_alpha {
    use super::*;

    #[test]
    fn for_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_alpha(&emitter, 0, 0.25);
        assert!((emitter.read().unwrap().data.alphas[0] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.write().unwrap().data.alphas[0] = 0.5;
        set_particle_emitter_2d_particle_alpha(&emitter, 1, 0.9);
        assert!((emitter.read().unwrap().data.alphas[0] - 0.5).abs() < 1e-6);
    }
}

mod set_particle_emitter_2d_particle_color {
    use super::*;

    #[test]
    fn for_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_color(&emitter, 0, 0.2, 0.4, 0.8);
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 0.2).abs() < 1e-6);
        assert!((guard.data.colors[1] - 0.4).abs() < 1e-6);
        assert!((guard.data.colors[2] - 0.8).abs() < 1e-6);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.write().unwrap().data.colors[0] = 0.5;
        set_particle_emitter_2d_particle_color(&emitter, 1, 0.9, 0.9, 0.9);
        assert!((emitter.read().unwrap().data.colors[0] - 0.5).abs() < 1e-6);
    }
}

mod set_particle_emitter_2d_particle_velocity {
    use super::*;

    #[test]
    fn for_valid_index() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        set_particle_emitter_2d_particle_velocity(&emitter, 0, 2.5, -3.0);
        let guard = emitter.read().unwrap();
        assert!((guard.data.velocities[0] - 2.5).abs() < 1e-6);
        assert!((guard.data.velocities[1] - (-3.0)).abs() < 1e-6);
    }

    #[test]
    fn noop_for_out_of_range() {
        let emitter = create_particle_emitter_2d();
        append_particle_emitter_2d_particle(&emitter, 0, 0.0, 0.0, 0.0, 1.0);
        emitter.write().unwrap().data.velocities[0] = 1.0;
        set_particle_emitter_2d_particle_velocity(&emitter, 1, 9.0, 9.0);
        assert!((emitter.read().unwrap().data.velocities[0] - 1.0).abs() < 1e-6);
    }
}
