use std::sync::atomic::{AtomicBool, AtomicI32, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_entity_uid};
use flight_geometry::{create_rectangle, create_vector2};
use flight_node::{NodeRef, get_node_local_bounds_rectangle, get_node_local_bounds_revision};
use flight_quadbatch::contract::*;
use flight_signals::{connect_signal, emit_signal};
use flight_texture::{Texture2D, create_texture_2d};
use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegion, TextureAtlasRegionOptions, TextureAtlasRotation,
    create_texture_atlas, create_texture_atlas_region, set_texture_atlas_region,
};

fn batch_with_data(setup: impl FnOnce(&mut QuadBatchData)) -> Ref<QuadBatch> {
    let batch = create_quad_batch();
    setup(&mut batch.write().unwrap().data);
    return batch;
}

fn make_quad_atlas(regions: Vec<Ref<TextureAtlasRegion>>) -> Ref<TextureAtlas> {
    let atlas = create_texture_atlas();
    atlas.write().unwrap().regions = regions;
    return atlas;
}

fn make_quad_region(id: i32, width: f32, height: f32) -> Ref<TextureAtlasRegion> {
    let make: fn() -> TextureAtlasRegionOptions = TextureAtlasRegionOptions::default;
    let options = TextureAtlasRegionOptions {
        height: Some(height),
        id: Some(id),
        width: Some(width),
        ..make()
    };
    let region = create_texture_atlas_region();
    set_texture_atlas_region(&mut region.write().unwrap(), &options);
    return region;
}

fn make_texture() -> Ref<Texture2D> {
    return Arc::new(RwLock::new(create_texture_2d()));
}

mod append_quad_batch_instance {
    use super::*;

    #[test]
    fn appends_an_instance_and_returns_its_index() {
        let batch = create_quad_batch();
        let idx = append_quad_batch_instance(&mut batch.write().unwrap(), 3, 10.0, 20.0);
        assert_eq!(idx, 0);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.instance_count, 1);
        assert_eq!(batch.data.ids[0], 3);
        assert_eq!(batch.data.transforms[0], 10.0);
        assert_eq!(batch.data.transforms[1], 20.0);
    }

    #[test]
    fn returns_sequential_indices_for_multiple_appends() {
        let batch = create_quad_batch();
        assert_eq!(
            append_quad_batch_instance(&mut batch.write().unwrap(), 0, 0.0, 0.0),
            0
        );
        assert_eq!(
            append_quad_batch_instance(&mut batch.write().unwrap(), 1, 5.0, 5.0),
            1
        );
        assert_eq!(batch.read().unwrap().data.instance_count, 2);
    }

    #[test]
    fn appends_sequential_instances_and_grows_capacity() {
        let batch = create_quad_batch();
        for index in 0..10 {
            let appended = append_quad_batch_instance(
                &mut batch.write().unwrap(),
                index as u16,
                index as f32,
                (index * 2) as f32,
            );
            assert_eq!(appended, index);
        }
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.instance_count, 10);
        assert!(get_quad_batch_capacity(&batch) >= 10);
        assert_eq!(&batch.data.transforms[18..20], &[9.0, 18.0]);
    }
}

mod clear_quad_batch {
    use super::*;

    #[test]
    fn clears_the_logical_count_without_releasing_capacity() {
        let batch = create_quad_batch();
        reserve_quad_batch(&mut batch.write().unwrap(), 50);
        resize_quad_batch(&mut batch.write().unwrap(), 10);
        let before = get_quad_batch_capacity(&batch.read().unwrap());
        clear_quad_batch(&mut batch.write().unwrap());
        assert_eq!(batch.read().unwrap().data.instance_count, 0);
        assert_eq!(get_quad_batch_capacity(&batch.read().unwrap()), before);
    }
}

mod clone_quad_batch {
    use super::*;

    #[test]
    fn shares_resource_identity_but_deep_copies_instance_buffers() {
        let atlas = make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]);
        let source = batch_with_data(|d| {
            d.atlas = Some(atlas.clone());
        });
        append_quad_batch_instance(&mut source.write().unwrap(), 0, 10.0, 20.0);
        set_quad_batch_instance_tint(&mut source.write().unwrap(), 0, 0x12345678);
        let copy = clone_quad_batch(&source.read().unwrap());
        assert!(!Arc::ptr_eq(&copy, &source));
        let source_guard = source.read().unwrap();
        let copy_guard = copy.read().unwrap();
        assert!(Arc::ptr_eq(copy_guard.data.atlas.as_ref().unwrap(), &atlas));
        assert_ne!(copy_guard.data.ids.as_ptr(), source_guard.data.ids.as_ptr());
        assert_ne!(
            copy_guard.data.transforms.as_ptr(),
            source_guard.data.transforms.as_ptr()
        );
        assert!(Arc::ptr_eq(
            copy_guard.data.material_data.as_ref().unwrap()[0]
                .as_ref()
                .unwrap(),
            source_guard.data.material_data.as_ref().unwrap()[0]
                .as_ref()
                .unwrap()
        ));
    }

    #[test]
    fn mutations_to_cloned_typed_arrays_do_not_leak_to_the_source() {
        let source = create_quad_batch();
        append_quad_batch_instance(&mut source.write().unwrap(), 1, 0.0, 0.0);
        let copy = clone_quad_batch(&source.read().unwrap());
        set_quad_batch_instance(&mut copy.write().unwrap(), 0, 5, 99.0, 99.0);
        assert_eq!(get_quad_batch_instance_id(&source.read().unwrap(), 0), 1);
        assert_eq!(source.read().unwrap().data.transforms[0], 0.0);
    }

    #[test]
    fn gives_the_clone_a_fresh_node_identity_and_runtime() {
        let source = create_quad_batch();
        let source_uid = get_entity_uid(&mut *source.write().unwrap());
        let copy = clone_quad_batch(&source.read().unwrap());
        let copy_uid = get_entity_uid(&mut *copy.write().unwrap());
        assert_ne!(source_uid, copy_uid);
        assert!(!Arc::ptr_eq(
            &get_quad_batch_runtime(&source.read().unwrap()),
            &get_quad_batch_runtime(&copy.read().unwrap())
        ));
        assert!(get_quad_batch_signals(&copy.read().unwrap()).is_none());
    }
}

mod compact_quad_batch {
    use super::*;

    #[test]
    fn stably_removes_sentinel_holes_without_shrinking_capacity() {
        let batch = create_quad_batch();
        append_quad_batch_instance(&mut batch.write().unwrap(), 10, 1.0, 1.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 11, 2.0, 2.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 12, 3.0, 3.0);
        let before = get_quad_batch_capacity(&batch.read().unwrap());
        batch.write().unwrap().data.ids[1] = QUAD_BATCH_DELETED_ID;
        compact_quad_batch(&mut batch.write().unwrap());
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.instance_count, 2);
        assert_eq!(&batch.data.ids[..2], &[10, 12]);
        assert_eq!(&batch.data.transforms[2..4], &[3.0, 3.0]);
        assert_eq!(get_quad_batch_capacity(&batch), before);
    }

    #[test]
    fn no_ops_for_empty_and_fully_live_batches() {
        let batch = create_quad_batch();
        compact_quad_batch(&mut batch.write().unwrap());
        append_quad_batch_instance(&mut batch.write().unwrap(), 1, 0.0, 0.0);
        compact_quad_batch(&mut batch.write().unwrap());
        assert_eq!(batch.read().unwrap().data.instance_count, 1);
    }
}

mod compute_quad_batch_local_bounds_rectangle {
    use super::*;

    #[test]
    fn returns_zero_without_an_atlas_or_live_instances() {
        let batch = create_quad_batch();
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_quad_batch_local_bounds_rectangle(&mut out, &batch.read().unwrap());
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn returns_zero_with_an_atlas_but_no_live_instances() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
        });
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_quad_batch_local_bounds_rectangle(&mut out, &batch.read().unwrap());
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn computes_aabb_over_vector2_quads() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 16.0)]));
            d.ids = vec![0, 0];
            d.instance_count = 2;
            d.transforms = vec![10.0, 20.0, 50.0, 100.0];
        });
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_quad_batch_local_bounds_rectangle(&mut out, &batch.read().unwrap());
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 72.0);
        assert_eq!(out.height, 96.0);
    }

    #[test]
    fn unions_valid_vector_quads_and_uses_rotated_logical_extents() {
        let rotated = make_quad_region(0, 10.0, 20.0);
        rotated.write().unwrap().rotation = TextureAtlasRotation::Clockwise90;
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![rotated]));
            d.ids = vec![0, 0, 99];
            d.instance_count = 3;
            d.transforms = vec![5.0, 7.0, 50.0, 100.0, 1000.0, 1000.0];
        });
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_quad_batch_local_bounds_rectangle(&mut out, &batch.read().unwrap());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (5.0, 7.0, 65.0, 103.0)
        );
    }

    #[test]
    fn computes_the_affine_quad_aabb_without_storing_it() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 10.0, 10.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![1.0, 0.0, 0.0, 1.0, 5.0, 5.0];
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        let node: NodeRef = batch.clone();
        let before = get_node_local_bounds_revision(&*batch.read().unwrap());
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_quad_batch_local_bounds_rectangle(&mut out, &batch.read().unwrap());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (5.0, 5.0, 10.0, 10.0)
        );
        assert_eq!(
            get_node_local_bounds_revision(&*batch.read().unwrap()),
            before
        );
        assert_eq!(get_node_local_bounds_rectangle(&node).width, 0.0);
    }
}

mod create_quad_batch {
    use super::*;

    #[test]
    fn fields_are_assignable_after_construction() {
        let atlas = make_quad_atlas(Vec::new());
        let batch = create_quad_batch();
        {
            let mut guard = batch.write().unwrap();
            guard.data.atlas = Some(atlas.clone());
            guard.data.instance_count = 1000;
            guard.data.transform_type = QuadTransformType::Matrix3x2;
            guard.alpha = 0.5;
            guard.x = 7.0;
        }
        let batch = batch.read().unwrap();
        assert_eq!(batch.kind, QUAD_BATCH_KIND);
        assert!(Arc::ptr_eq(batch.data.atlas.as_ref().unwrap(), &atlas));
        assert_eq!(batch.data.instance_count, 1000);
        assert_eq!(batch.data.transform_type, QuadTransformType::Matrix3x2);
        assert_eq!((batch.x, batch.alpha), (7.0, 0.5));
    }

    #[test]
    fn initializes_the_complete_batch_defaults() {
        let batch = create_quad_batch();
        let batch = batch.read().unwrap();
        assert_eq!(batch.kind, QUAD_BATCH_KIND);
        assert!(batch.data.atlas.is_none());
        assert!(batch.data.ids.is_empty());
        assert_eq!(batch.data.instance_count, 0);
        assert!(batch.data.material_data.is_none());
        assert!(batch.data.transforms.is_empty());
        assert_eq!(batch.data.transform_type, QuadTransformType::Vector2);
    }

    #[test]
    fn composes_the_complete_node2d_feature_family() {
        let batch = create_quad_batch();
        let node: NodeRef = batch.clone();
        let node = node.read().unwrap();
        assert!(node.as_transform2d_node().is_some());
        assert!(node.as_bounds_node().is_some());
        assert!(node.as_appearance_node().is_some());
        assert!(node.as_clip_node().is_some());
        assert!(node.as_material_node().is_some());
    }

    #[test]
    fn returns_a_fresh_object_each_call() {
        assert!(!Arc::ptr_eq(&create_quad_batch(), &create_quad_batch()));
    }
}

mod create_quad_batch_data {
    use super::*;

    #[test]
    fn returns_typed_buffer_defaults() {
        let defaults = create_quad_batch_data();
        assert!(defaults.atlas.is_none());
        assert!(defaults.ids.is_empty());
        assert_eq!(defaults.instance_count, 0);
        assert!(defaults.material_data.is_none());
        assert!(defaults.transforms.is_empty());
        assert_eq!(defaults.transform_type, QuadTransformType::Vector2);
    }

    #[test]
    fn fields_are_assignable_after_creation() {
        let mut data = create_quad_batch_data();
        data.instance_count = 10;
        assert_eq!(data.instance_count, 10);
    }
}

mod create_quad_batch_runtime {
    use super::*;

    #[test]
    fn returns_a_node2d_runtime_with_bounds_storage_starting_empty() {
        let runtime = create_quad_batch_runtime();
        assert!(runtime.bounds.local_bounds_rectangle.is_none());
    }
}

mod create_quad_batch_signals {
    use super::*;

    #[test]
    fn creates_three_independently_emittable_signals() {
        let signals = create_quad_batch_signals();
        let appended = Arc::new(AtomicUsize::new(usize::MAX));
        let removed = Arc::new(AtomicI32::new(i32::MIN));
        let cleared = Arc::new(AtomicBool::new(false));
        {
            let signals = signals.read().unwrap();
            let received = appended.clone();
            connect_signal(
                &signals.on_instance_appended,
                Arc::new(move |index| received.store(*index, Ordering::Relaxed)),
                None,
            );
            let received = removed.clone();
            connect_signal(
                &signals.on_instance_removed,
                Arc::new(move |(_, swap_source)| received.store(*swap_source, Ordering::Relaxed)),
                None,
            );
            let received = cleared.clone();
            connect_signal(
                &signals.on_cleared,
                Arc::new(move |_| received.store(true, Ordering::Relaxed)),
                None,
            );
            emit_signal(&signals.on_instance_appended, &4);
            emit_signal(&signals.on_instance_removed, &(1, 2));
            emit_signal(&signals.on_cleared, &());
        }
        assert_eq!(appended.load(Ordering::Relaxed), 4);
        assert_eq!(removed.load(Ordering::Relaxed), 2);
        assert!(cleared.load(Ordering::Relaxed));
    }
}

mod enable_quad_batch_signals {
    use super::*;

    #[test]
    fn preserves_group_identity_and_makes_mutations_emit() {
        let batch = create_quad_batch();
        let signals = enable_quad_batch_signals(&mut batch.write().unwrap());
        let same = enable_quad_batch_signals(&mut batch.write().unwrap());
        assert!(Arc::ptr_eq(&signals, &same));
        let appended = Arc::new(AtomicUsize::new(usize::MAX));
        let cleared = Arc::new(AtomicBool::new(false));
        {
            let signals = signals.read().unwrap();
            let received = appended.clone();
            connect_signal(
                &signals.on_instance_appended,
                Arc::new(move |index| received.store(*index, Ordering::Relaxed)),
                None,
            );
            let received = cleared.clone();
            connect_signal(
                &signals.on_cleared,
                Arc::new(move |_| received.store(true, Ordering::Relaxed)),
                None,
            );
        }
        append_quad_batch_instance(&mut batch.write().unwrap(), 0, 0.0, 0.0);
        clear_quad_batch(&mut batch.write().unwrap());
        assert_eq!(appended.load(Ordering::Relaxed), 0);
        assert!(cleared.load(Ordering::Relaxed));
    }
}

mod get_quad_batch_capacity {
    use super::*;

    #[test]
    fn returns_the_lower_of_id_and_transform_capacities() {
        let batch = batch_with_data(|d| {
            d.ids = vec![0; 10];
            d.transforms = vec![0.0; 40];
        });
        assert_eq!(get_quad_batch_capacity(&batch.read().unwrap()), 10);
        batch.write().unwrap().data.ids.resize(100, 0);
        assert_eq!(get_quad_batch_capacity(&batch.read().unwrap()), 20);
    }

    #[test]
    fn returns_zero_for_a_new_batch() {
        assert_eq!(
            get_quad_batch_capacity(&create_quad_batch().read().unwrap()),
            0
        );
    }
}

mod get_quad_batch_instance_id {
    use super::*;

    #[test]
    fn returns_the_id_or_negative_one_outside_the_logical_prefix() {
        let batch = create_quad_batch();
        resize_quad_batch(&mut batch.write().unwrap(), 2);
        set_quad_batch_instance(&mut batch.write().unwrap(), 1, 7, 0.0, 0.0);
        assert_eq!(get_quad_batch_instance_id(&batch.read().unwrap(), 1), 7);
        assert_eq!(get_quad_batch_instance_id(&batch.read().unwrap(), -1), -1);
        assert_eq!(get_quad_batch_instance_id(&batch.read().unwrap(), 2), -1);
    }
}

mod get_quad_batch_instance_transform {
    use super::*;

    #[test]
    fn writes_vector_translation_or_matrix_offset_and_leaves_misses_unchanged() {
        let vector = create_quad_batch();
        resize_quad_batch(&mut vector.write().unwrap(), 1);
        set_quad_batch_instance(&mut vector.write().unwrap(), 0, 0, 15.0, 25.0);
        let mut out = create_vector2(99.0, 99.0);
        assert!(get_quad_batch_instance_transform(
            &mut out,
            &vector.read().unwrap(),
            0
        ));
        assert_eq!((out.x, out.y), (15.0, 25.0));
        assert!(!get_quad_batch_instance_transform(
            &mut out,
            &vector.read().unwrap(),
            5
        ));
        assert_eq!((out.x, out.y), (15.0, 25.0));

        let matrix = batch_with_data(|d| {
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        resize_quad_batch(&mut matrix.write().unwrap(), 1);
        set_quad_batch_instance_matrix(
            &mut matrix.write().unwrap(),
            0,
            0,
            1.0,
            0.0,
            0.0,
            1.0,
            55.0,
            66.0,
        );
        get_quad_batch_instance_transform(&mut out, &matrix.read().unwrap(), 0);
        assert_eq!((out.x, out.y), (55.0, 66.0));
    }
}

mod get_quad_batch_runtime {
    use super::*;

    #[test]
    fn returns_the_same_private_runtime_each_time() {
        let batch = create_quad_batch();
        let a = get_quad_batch_runtime(&batch.read().unwrap());
        let b = get_quad_batch_runtime(&batch.read().unwrap());
        assert!(Arc::ptr_eq(&a, &b));
        assert!(a.read().unwrap().instance_velocities.is_none());
    }
}

mod get_quad_batch_signals {
    use super::*;

    #[test]
    fn returns_none_until_enabled_then_the_attached_identity() {
        let batch = create_quad_batch();
        assert!(get_quad_batch_signals(&batch.read().unwrap()).is_none());
        let signals = enable_quad_batch_signals(&mut batch.write().unwrap());
        assert!(Arc::ptr_eq(
            &signals,
            &get_quad_batch_signals(&batch.read().unwrap()).unwrap()
        ));
    }
}

mod get_quad_batch_transform_stride {
    use super::*;

    #[test]
    fn maps_vector_and_matrix_layouts_to_two_and_six() {
        assert_eq!(
            get_quad_batch_transform_stride(QuadTransformType::Vector2),
            2
        );
        assert_eq!(
            get_quad_batch_transform_stride(QuadTransformType::Matrix3x2),
            6
        );
    }
}

mod hit_test_quad_batch_point {
    use super::*;

    #[test]
    fn delegates_point_coordinates_to_the_aabb_test() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![10.0, 20.0];
        });
        assert_eq!(
            hit_test_quad_batch_point(&batch.read().unwrap(), &create_vector2(15.0, 25.0)),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point(&batch.read().unwrap(), &create_vector2(5.0, 5.0)),
            -1
        );
    }
}

mod hit_test_quad_batch_point_exact {
    use super::*;

    #[test]
    fn delegates_point_coordinates_to_the_exact_test() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![10.0, 20.0];
        });
        assert_eq!(
            hit_test_quad_batch_point_exact(&batch.read().unwrap(), &create_vector2(15.0, 25.0)),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_exact(&batch.read().unwrap(), &create_vector2(5.0, 5.0)),
            -1
        );
    }
}

mod hit_test_quad_batch_point_exact_xy {
    use super::*;

    #[test]
    fn hits_an_axis_aligned_vector2_quad() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![10.0, 20.0];
        });
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 15.0, 25.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 5.0, 5.0),
            -1
        );
    }

    #[test]
    fn rejects_an_aabb_corner_outside_a_rotated_affine_quad() {
        let sine = std::f32::consts::FRAC_1_SQRT_2;
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 100.0, 100.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![sine, sine, -sine, sine, 0.0, 0.0];
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 60.0, 5.0),
            -1
        );
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 0.0, 70.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 60.0, 5.0),
            0
        );
    }

    #[test]
    fn returns_negative_one_without_an_atlas_or_without_live_instances() {
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&create_quad_batch().read().unwrap(), 0.0, 0.0),
            -1
        );
        let empty = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
        });
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&empty.read().unwrap(), 0.0, 0.0),
            -1
        );
    }

    #[test]
    fn honors_rotated_logical_extent_and_skips_invalid_region_ids() {
        let region = make_quad_region(0, 10.0, 20.0);
        region.write().unwrap().rotation = TextureAtlasRotation::Clockwise90;
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![region]));
            d.ids = vec![0, 99];
            d.instance_count = 2;
            d.transforms = vec![0.0, 0.0, 0.0, 0.0];
        });
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 15.0, 5.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_exact_xy(&batch.read().unwrap(), 5.0, 15.0),
            -1
        );
    }
}

mod hit_test_quad_batch_point_xy {
    use super::*;

    #[test]
    fn returns_first_half_open_hit_and_skips_invalid_ids() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0, 0, 99];
            d.instance_count = 3;
            d.transforms = vec![10.0, 20.0, 10.0, 20.0, 0.0, 0.0];
        });
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 15.0, 25.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 42.0, 20.0),
            -1
        );
    }

    #[test]
    fn finds_a_later_vector_instance() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0, 0];
            d.instance_count = 2;
            d.transforms = vec![10.0, 20.0, 100.0, 200.0];
        });
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 110.0, 210.0),
            1
        );
    }

    #[test]
    fn returns_negative_one_without_an_atlas_or_instances() {
        assert_eq!(
            hit_test_quad_batch_point_xy(&create_quad_batch().read().unwrap(), 0.0, 0.0),
            -1
        );
        let empty = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
        });
        assert_eq!(
            hit_test_quad_batch_point_xy(&empty.read().unwrap(), 0.0, 0.0),
            -1
        );
    }

    #[test]
    fn returns_the_index_of_a_hit_quad_for_matrix3x2_transforms() {
        let batch = batch_with_data(|d| {
            d.atlas = Some(make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]));
            d.ids = vec![0];
            d.instance_count = 1;
            d.transforms = vec![1.0, 0.0, 0.0, 1.0, 50.0, 60.0];
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 60.0, 70.0),
            0
        );
        assert_eq!(
            hit_test_quad_batch_point_xy(&batch.read().unwrap(), 40.0, 50.0),
            -1
        );
    }
}

mod initialize_quad_batch {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_quad_batch() {
        let batch = create_quad_batch();
        let atlas = make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]);
        set_quad_batch_local_bounds_rectangle(&batch, &create_rectangle(1.0, 2.0, 3.0, 4.0));
        let stale_runtime = get_quad_batch_runtime(&batch.read().unwrap());
        {
            let mut guard = batch.write().unwrap();
            flight_entity::set_entity_uid(&mut *guard, "batch".to_string());
            enable_quad_batch_signals(&mut guard);
            append_quad_batch_instance(&mut guard, 0, 5.0, 6.0);
            guard.data.atlas = Some(atlas);
            guard.data.transform_type = QuadTransformType::Matrix3x2;
            initialize_quad_batch(&mut guard);
        }
        let mut guard = batch.write().unwrap();
        // Construction only: the receiver keeps its identity and gets the factory's defaults.
        assert_eq!(get_entity_uid(&mut *guard), "batch");
        assert_eq!(guard.kind, QUAD_BATCH_KIND);
        assert!(guard.data.atlas.is_none());
        assert!(guard.data.ids.is_empty());
        assert_eq!(guard.data.instance_count, 0);
        assert!(guard.data.material_data.is_none());
        assert!(guard.data.transforms.is_empty());
        assert_eq!(guard.data.transform_type, QuadTransformType::Vector2);
        assert!(get_quad_batch_signals(&guard).is_none());
        // A fresh batch runtime tier: the previously set explicit bounds are not carried over.
        let runtime = get_quad_batch_runtime(&guard);
        assert!(!Arc::ptr_eq(&runtime, &stale_runtime));
        assert!(runtime.read().unwrap().local_bounds_rectangle.is_none());
    }
}

mod initialize_quad_batch_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_quad_batch_data() {
        let mut out = create_quad_batch_data();
        flight_entity::set_entity_uid(&mut out, "data".to_string());
        out.atlas = Some(make_quad_atlas(Vec::new()));
        out.ids = vec![3, 4];
        out.instance_count = 2;
        out.transforms = vec![1.0, 2.0, 3.0, 4.0];
        out.transform_type = QuadTransformType::Matrix3x2;
        initialize_quad_batch_data(&mut out);
        let defaults = create_quad_batch_data();
        assert_eq!(get_entity_uid(&mut out), "data");
        assert!(out.atlas.is_none());
        assert_eq!(out.ids, defaults.ids);
        assert_eq!(out.instance_count, defaults.instance_count);
        assert!(out.material_data.is_none());
        assert_eq!(out.transforms, defaults.transforms);
        assert_eq!(out.transform_type, QuadTransformType::Vector2);
    }
}

mod initialize_quad_batch_signals {
    use super::*;

    #[test]
    fn replaces_the_three_signal_identities() {
        let signals = create_quad_batch_signals();
        let before = signals.read().unwrap().on_cleared.data.clone();
        initialize_quad_batch_signals(&mut signals.write().unwrap());
        assert!(!Arc::ptr_eq(
            &before,
            &signals.read().unwrap().on_cleared.data
        ));
    }
}

mod iterate_quad_batch_instances {
    use super::*;

    #[test]
    fn visits_each_instance_in_order_with_a_stride_length_view() {
        let batch = create_quad_batch();
        append_quad_batch_instance(&mut batch.write().unwrap(), 7, 1.0, 2.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 8, 3.0, 4.0);
        let mut seen = Vec::new();
        iterate_quad_batch_instances(&batch.read().unwrap(), &mut |index, id, transform| {
            seen.push((index, id, transform.to_vec()))
        });
        assert_eq!(seen, vec![(0, 7, vec![1.0, 2.0]), (1, 8, vec![3.0, 4.0])]);

        let matrix = batch_with_data(|d| {
            d.ids = vec![2];
            d.instance_count = 1;
            d.transforms = vec![1.0, 0.0, 0.0, 1.0, 9.0, 10.0];
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        let mut length = 0;
        iterate_quad_batch_instances(&matrix.read().unwrap(), &mut |_, _, transform| {
            length = transform.len()
        });
        assert_eq!(length, 6);
    }

    #[test]
    fn does_not_invoke_the_visitor_for_an_empty_batch() {
        let batch = create_quad_batch();
        let mut calls = 0;
        iterate_quad_batch_instances(&batch.read().unwrap(), &mut |_, _, _| calls += 1);
        assert_eq!(calls, 0);
    }
}

mod remove_quad_batch_instance {
    use super::*;

    #[test]
    fn swap_removes_and_reports_the_swap_source() {
        let batch = create_quad_batch();
        append_quad_batch_instance(&mut batch.write().unwrap(), 0, 0.0, 0.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 1, 10.0, 10.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 2, 20.0, 20.0);
        let signals = enable_quad_batch_signals(&mut batch.write().unwrap());
        let swap = Arc::new(AtomicI32::new(i32::MIN));
        {
            let received = swap.clone();
            connect_signal(
                &signals.read().unwrap().on_instance_removed,
                Arc::new(move |(_, source)| received.store(*source, Ordering::Relaxed)),
                None,
            );
        }
        remove_quad_batch_instance(&mut batch.write().unwrap(), 0);
        assert_eq!(batch.read().unwrap().data.instance_count, 2);
        assert_eq!(get_quad_batch_instance_id(&batch.read().unwrap(), 0), 2);
        assert_eq!(swap.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn removes_the_last_directly_and_no_ops_outside_the_prefix() {
        let batch = create_quad_batch();
        append_quad_batch_instance(&mut batch.write().unwrap(), 5, 50.0, 50.0);
        remove_quad_batch_instance(&mut batch.write().unwrap(), -1);
        remove_quad_batch_instance(&mut batch.write().unwrap(), 1);
        assert_eq!(batch.read().unwrap().data.instance_count, 1);
        remove_quad_batch_instance(&mut batch.write().unwrap(), 0);
        assert_eq!(batch.read().unwrap().data.instance_count, 0);
    }
}

mod reserve_quad_batch {
    use super::*;

    #[test]
    fn allocates_exact_typed_array_lengths_and_no_ops_at_or_below_capacity() {
        let batch = create_quad_batch();
        reserve_quad_batch(&mut batch.write().unwrap(), 100);
        let ids = batch.read().unwrap().data.ids.as_ptr();
        let transforms = batch.read().unwrap().data.transforms.as_ptr();
        reserve_quad_batch(&mut batch.write().unwrap(), 50);
        reserve_quad_batch(&mut batch.write().unwrap(), 100);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.ids.len(), 100);
        assert_eq!(batch.data.transforms.len(), 200);
        assert_eq!(batch.data.ids.as_ptr(), ids);
        assert_eq!(batch.data.transforms.as_ptr(), transforms);
    }
}

mod resize_quad_batch {
    use super::*;

    #[test]
    fn grows_capacity_and_preserves_the_untinted_shared_atlas_path_at_scale() {
        let texture = make_texture();
        let atlas = make_quad_atlas(vec![make_quad_region(0, 32.0, 32.0)]);
        atlas.write().unwrap().texture = Some(texture.clone());
        let batch = batch_with_data(|d| {
            d.atlas = Some(atlas.clone());
        });
        resize_quad_batch(&mut batch.write().unwrap(), 300_000);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.instance_count, 300_000);
        assert!(batch.data.material_data.is_none());
        assert!(Arc::ptr_eq(
            batch
                .data
                .atlas
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture
                .as_ref()
                .unwrap(),
            &texture
        ));
        assert_eq!(batch.data.ids.len(), 300_000);
        assert_eq!(batch.data.transforms.len(), 600_000);
    }

    #[test]
    fn trusts_a_shrinking_logical_count_without_allocating() {
        let batch = batch_with_data(|d| {
            d.instance_count = 200;
        });
        resize_quad_batch(&mut batch.write().unwrap(), 100);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.instance_count, 100);
        assert!(batch.data.ids.is_empty());
        assert!(batch.data.transforms.is_empty());
    }
}

mod set_quad_batch_instance {
    use super::*;

    #[test]
    fn writes_inside_the_prefix_and_no_ops_outside_it() {
        let batch = create_quad_batch();
        resize_quad_batch(&mut batch.write().unwrap(), 3);
        set_quad_batch_instance(&mut batch.write().unwrap(), 1, 7, 100.0, 200.0);
        set_quad_batch_instance(&mut batch.write().unwrap(), -1, 9, 0.0, 0.0);
        set_quad_batch_instance(&mut batch.write().unwrap(), 3, 9, 0.0, 0.0);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.ids, vec![0, 7, 0]);
        assert_eq!(&batch.data.transforms[2..4], &[100.0, 200.0]);
    }
}

mod set_quad_batch_instance_matrix {
    use super::*;

    #[test]
    fn writes_all_six_affine_components_inside_the_prefix() {
        let batch = batch_with_data(|d| {
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        resize_quad_batch(&mut batch.write().unwrap(), 1);
        set_quad_batch_instance_matrix(
            &mut batch.write().unwrap(),
            0,
            3,
            1.0,
            2.0,
            3.0,
            4.0,
            5.0,
            6.0,
        );
        set_quad_batch_instance_matrix(
            &mut batch.write().unwrap(),
            1,
            9,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
        );
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.ids[0], 3);
        assert_eq!(&batch.data.transforms[..6], &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    }
}

mod set_quad_batch_instance_range {
    use super::*;

    #[test]
    fn copies_vector_and_matrix_ranges_and_rejects_invalid_ranges() {
        let vector = create_quad_batch();
        resize_quad_batch(&mut vector.write().unwrap(), 3);
        set_quad_batch_instance_range(
            &mut vector.write().unwrap(),
            1,
            2,
            &[10.0, 20.0, 30.0, 40.0],
        );
        set_quad_batch_instance_range(&mut vector.write().unwrap(), -1, 1, &[99.0, 99.0]);
        set_quad_batch_instance_range(&mut vector.write().unwrap(), 1, 5, &[99.0; 10]);
        assert_eq!(
            &vector.read().unwrap().data.transforms[2..6],
            &[10.0, 20.0, 30.0, 40.0]
        );

        let matrix = batch_with_data(|d| {
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        resize_quad_batch(&mut matrix.write().unwrap(), 1);
        set_quad_batch_instance_range(
            &mut matrix.write().unwrap(),
            0,
            1,
            &[1.0, 0.0, 0.0, 1.0, 7.0, 8.0],
        );
        assert_eq!(&matrix.read().unwrap().data.transforms[4..6], &[7.0, 8.0]);
    }

    #[test]
    fn no_ops_for_a_zero_count() {
        let batch = create_quad_batch();
        resize_quad_batch(&mut batch.write().unwrap(), 2);
        set_quad_batch_instance_range(&mut batch.write().unwrap(), 0, 0, &[1.0, 2.0]);
        assert_eq!(batch.read().unwrap().data.transforms[0], 0.0);
    }
}

mod set_quad_batch_instance_tint {
    use super::*;

    #[test]
    fn lazily_allocates_per_instance_material_slots_and_stores_packed_rgba() {
        let batch = batch_with_data(|d| {
            d.instance_count = 3;
        });
        set_quad_batch_instance_tint(&mut batch.write().unwrap(), 1, 0x12345678);
        let tint_ref = {
            let batch_guard = batch.read().unwrap();
            let materials = batch_guard.data.material_data.as_ref().unwrap();
            assert_eq!(materials.len(), 3);
            assert!(materials[0].is_none());
            assert!(materials[2].is_none());
            materials[1].clone().expect("material_data[1] present")
        };
        let tint_guard = tint_ref.read().unwrap();
        let tint_data = tint_guard
            .as_any()
            .downcast_ref::<flight_materials::TintMaterialData>()
            .expect("material_data[1] is TintMaterialData");
        assert_eq!(tint_data.tint, 0x12345678);

        let untouched = batch_with_data(|d| {
            d.instance_count = 1;
        });
        set_quad_batch_instance_tint(&mut untouched.write().unwrap(), 2, u32::MAX);
        assert!(untouched.read().unwrap().data.material_data.is_none());
    }
}

mod set_quad_batch_local_bounds_rectangle {
    use super::*;

    #[test]
    fn copies_explicit_bounds_and_invalidates_the_node_cache() {
        let batch = create_quad_batch();
        let node: NodeRef = batch.clone();
        let before = get_node_local_bounds_revision(&*batch.read().unwrap());
        let mut rect = create_rectangle(10.0, 20.0, 32.0, 16.0);
        set_quad_batch_local_bounds_rectangle(&batch, &rect);
        rect.width = 999.0;
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (10.0, 20.0, 32.0, 16.0)
        );
        assert_ne!(
            get_node_local_bounds_revision(&*batch.read().unwrap()),
            before
        );
    }

    #[test]
    fn returns_zero_node_bounds_before_any_explicit_set() {
        let batch = create_quad_batch();
        let node: NodeRef = batch;
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!((bounds.width, bounds.height), (0.0, 0.0));
    }
}

mod set_quad_batch_transform_type {
    use super::*;

    #[test]
    fn expands_vectors_to_identity_matrices_without_losing_capacity() {
        let batch = create_quad_batch();
        reserve_quad_batch(&mut batch.write().unwrap(), 4);
        append_quad_batch_instance(&mut batch.write().unwrap(), 0, 5.0, 6.0);
        append_quad_batch_instance(&mut batch.write().unwrap(), 1, 7.0, 8.0);
        set_quad_batch_transform_type(&mut batch.write().unwrap(), QuadTransformType::Matrix3x2);
        let batch = batch.read().unwrap();
        assert_eq!(batch.data.transform_type, QuadTransformType::Matrix3x2);
        assert_eq!(
            &batch.data.transforms[..12],
            &[1.0, 0.0, 0.0, 1.0, 5.0, 6.0, 1.0, 0.0, 0.0, 1.0, 7.0, 8.0]
        );
        assert_eq!(batch.data.transforms.len(), 24);
    }

    #[test]
    fn collapses_matrices_in_place_to_translation_only() {
        let batch = batch_with_data(|d| {
            d.transform_type = QuadTransformType::Matrix3x2;
        });
        resize_quad_batch(&mut batch.write().unwrap(), 2);
        set_quad_batch_instance_matrix(
            &mut batch.write().unwrap(),
            0,
            0,
            2.0,
            0.0,
            0.0,
            2.0,
            10.0,
            20.0,
        );
        set_quad_batch_instance_matrix(
            &mut batch.write().unwrap(),
            1,
            1,
            2.0,
            0.0,
            0.0,
            2.0,
            30.0,
            40.0,
        );
        let allocation_length = batch.read().unwrap().data.transforms.len();
        set_quad_batch_transform_type(&mut batch.write().unwrap(), QuadTransformType::Vector2);
        let batch = batch.read().unwrap();
        assert_eq!(&batch.data.transforms[..4], &[10.0, 20.0, 30.0, 40.0]);
        assert_eq!(batch.data.transforms.len(), allocation_length);
    }

    #[test]
    fn no_ops_without_replacing_the_buffer_when_the_layout_matches() {
        let batch = create_quad_batch();
        reserve_quad_batch(&mut batch.write().unwrap(), 2);
        let pointer = batch.read().unwrap().data.transforms.as_ptr();
        set_quad_batch_transform_type(&mut batch.write().unwrap(), QuadTransformType::Vector2);
        assert_eq!(batch.read().unwrap().data.transforms.as_ptr(), pointer);
    }
}
