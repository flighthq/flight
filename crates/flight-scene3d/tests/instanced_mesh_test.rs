use crate::support::*;
use flight_entity::Ref;
use flight_geometry::create_matrix4;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d::contract::*;
use flight_signals::connect_signal;
use std::sync::{Arc, Mutex, RwLock};
fn bounded_geometry() -> Ref<flight_meshgeometry::MeshGeometry> {
    return Arc::new(RwLock::new(create_box_mesh_geometry(
        Some(2.0),
        Some(2.0),
        Some(2.0),
    )));
}
fn batch(xs: &[f32]) -> Ref<InstancedMesh> {
    let b = create_instanced_mesh(
        bounded_geometry(),
        Arc::new(RwLock::new(vec![None])),
        Some(8),
        None,
    );
    for x in xs {
        append_instanced_mesh_instance(&b, &translation(*x, 0.0, 0.0));
    }
    return b;
}
fn translation_x(mesh: &Ref<InstancedMesh>, index: i32) -> f32 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    get_instanced_mesh_instance_matrix(&mut out, &mesh.read().unwrap(), index);
    return out.m[12];
}
mod append_instanced_mesh_instance {
    use super::*;
    #[test]
    fn grows_count_before_copying_matrices_returns_indices_and_grows_capacity() {
        let b = batch(&[]);
        set_instanced_mesh_instance_matrix(&b, 0, &translation(9.0, 0.0, 0.0));
        assert_eq!(b.read().unwrap().instance_count, 0);
        let before = b.read().unwrap().version;
        assert_eq!(
            append_instanced_mesh_instance(&b, &translation(9.0, 0.0, 0.0)),
            0
        );
        assert_eq!(b.read().unwrap().version, before + 2);
        assert_eq!(
            append_instanced_mesh_instance(&b, &translation(2.0, 0.0, 0.0)),
            1
        );
        assert_eq!(b.read().unwrap().instance_count, 2);
        assert_eq!(translation_x(&b, 0), 9.0);
        assert_eq!(translation_x(&b, 1), 2.0);
        let small = create_instanced_mesh(bounded_geometry(), empty_materials(), Some(2), None);
        for i in 0..5 {
            append_instanced_mesh_instance(&small, &translation(i as f32, 0.0, 0.0));
        }
        assert_eq!(small.read().unwrap().instance_count, 5);
        assert!(get_instanced_mesh_capacity(&small.read().unwrap()) >= 5);
        assert_eq!(translation_x(&small, 4), 4.0);
    }
    #[test]
    fn emits_new_indices_after_releasing_the_original_batch_lock() {
        let b = batch(&[]);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let original = b.clone();
        let signal = enable_instanced_mesh_signals(&b)
            .read()
            .unwrap()
            .on_instance_appended
            .clone();
        connect_signal(
            &signal,
            Arc::new(move |index| {
                assert!(original.try_write().is_ok());
                sink.lock().unwrap().push(*index);
            }),
            None,
        );
        append_instanced_mesh_instance(&b, &translation(1.0, 0.0, 0.0));
        append_instanced_mesh_instance(&b, &translation(2.0, 0.0, 0.0));
        assert_eq!(*seen.lock().unwrap(), vec![0, 1]);
    }
}
mod clear_instanced_mesh {
    use super::*;
    #[test]
    fn keeps_capacity_and_emits_even_when_already_empty() {
        let b = batch(&[1.0, 2.0, 3.0]);
        let capacity = get_instanced_mesh_capacity(&b.read().unwrap());
        let seen = Arc::new(Mutex::new(0));
        let sink = seen.clone();
        let signal = enable_instanced_mesh_signals(&b)
            .read()
            .unwrap()
            .on_cleared
            .clone();
        connect_signal(&signal, Arc::new(move |_| *sink.lock().unwrap() += 1), None);
        clear_instanced_mesh(&b);
        assert_eq!(b.read().unwrap().instance_count, 0);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), capacity);
        assert_eq!(*seen.lock().unwrap(), 1);
        clear_instanced_mesh(&b);
        assert_eq!(*seen.lock().unwrap(), 2);
    }
}
mod clone_instanced_mesh {
    use super::*;
    #[test]
    fn copies_live_matrix_values_and_colors_but_shares_geometry_and_material_entries() {
        let b = batch(&[1.0, 2.0]);
        set_instanced_mesh_instance_color(&b, 1, 0xff0000ff);
        let c = clone_instanced_mesh(&b.read().unwrap());
        assert_eq!(c.read().unwrap().version, 0);
        set_instanced_mesh_instance_matrix(&c, 0, &translation(99.0, 0.0, 0.0));
        set_instanced_mesh_instance_color(&c, 1, 0x00ff00ff);
        assert_eq!(c.read().unwrap().instance_count, 2);
        assert_eq!(translation_x(&c, 1), 2.0);
        assert_eq!(translation_x(&b, 0), 1.0);
        let b = b.read().unwrap();
        let c = c.read().unwrap();
        assert!(Arc::ptr_eq(&b.geometry, &c.geometry));
        assert!(!Arc::ptr_eq(&b.materials, &c.materials));
        assert_eq!(
            b.materials.read().unwrap().len(),
            c.materials.read().unwrap().len()
        );
        assert!(c.materials.read().unwrap()[0].is_none());
        assert!(!Arc::ptr_eq(
            &b.instance_matrices[0],
            &c.instance_matrices[0]
        ));
        assert_eq!(
            get_instanced_mesh_instance_color(&b, 1),
            0xff0000ffu32 as f64
        );
        assert_eq!(
            get_instanced_mesh_instance_color(&c, 1),
            0x00ff00ffu32 as f64
        );
        assert_eq!(c.version, 2);
    }
}
mod compute_instanced_mesh_local_bounds_aabb {
    use super::*;
    #[test]
    fn spans_only_live_instances_and_writes_empty_bounds_for_empty_batches() {
        let b = batch(&[0.0, 10.0]);
        let mut out = empty_bounds();
        compute_instanced_mesh_local_bounds_aabb(&mut out, &b.read().unwrap());
        close(out.min.x, -1.0);
        close(out.max.x, 11.0);
        remove_instanced_mesh_instance(&b, 1);
        compute_instanced_mesh_local_bounds_aabb(&mut out, &b.read().unwrap());
        close(out.max.x, 1.0);
        let b = batch(&[]);
        compute_instanced_mesh_local_bounds_aabb(&mut out, &b.read().unwrap());
        assert!(out.min.x > out.max.x);
    }
}
mod create_instanced_mesh {
    use super::*;
    #[test]
    fn retains_geometry_and_requested_capacity_with_zero_live_count_and_no_colors() {
        let g = bounded_geometry();
        let b = create_instanced_mesh(g.clone(), empty_materials(), None, None);
        let b = b.read().unwrap();
        assert_eq!(b.kind, INSTANCED_MESH_KIND);
        assert_eq!(b.instance_count, 0);
        assert!(b.instance_colors.is_none());
        assert!(Arc::ptr_eq(&b.geometry, &g));
        assert_eq!(get_instanced_mesh_capacity(&b), 16);
        drop(b);
        let b = create_instanced_mesh(bounded_geometry(), empty_materials(), Some(32), None);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), 32);
    }
}
mod create_instanced_mesh_signals {
    use super::*;
    #[test]
    fn creates_three_unconnected_entity_owned_signals() {
        let s = create_instanced_mesh_signals();
        let s = s.read().unwrap();
        assert!(s.on_cleared.data.read().unwrap().is_none());
        assert!(s.on_instance_appended.data.read().unwrap().is_none());
        assert!(s.on_instance_removed.data.read().unwrap().is_none());
    }
}
mod enable_instanced_mesh_signals {
    use super::*;
    #[test]
    fn retains_same_original_signal_group_on_repeat_calls() {
        let b = batch(&[1.0]);
        let s = enable_instanced_mesh_signals(&b);
        assert!(Arc::ptr_eq(&s, &enable_instanced_mesh_signals(&b)));
    }
}
mod get_instanced_mesh_capacity {
    use super::*;
    #[test]
    fn reports_allocated_slots_rather_than_live_instances() {
        let b = create_instanced_mesh(bounded_geometry(), empty_materials(), Some(16), None);
        append_instanced_mesh_instance(&b, &translation(1.0, 0.0, 0.0));
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), 16);
    }
}
mod get_instanced_mesh_instance_color {
    use super::*;
    #[test]
    fn distinguishes_all_packed_color_bits_opaque_white_and_negative_out_of_range_sentinel() {
        let b = batch(&[1.0, 2.0]);
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 0),
            4294967295.0
        );
        set_instanced_mesh_instance_color(&b, 1, 0x11223344);
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 1),
            0x11223344u32 as f64
        );
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 2),
            -1.0
        );
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), -1),
            -1.0
        );
    }
}
mod get_instanced_mesh_instance_matrix {
    use super::*;
    #[test]
    fn copies_valid_matrix_and_leaves_out_untouched_on_negative_or_past_end_indices() {
        let b = batch(&[5.0]);
        let mut out = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        assert!(get_instanced_mesh_instance_matrix(
            &mut out,
            &b.read().unwrap(),
            0
        ));
        assert_eq!(out.m[12], 5.0);
        out = translation(42.0, 0.0, 0.0);
        assert!(!get_instanced_mesh_instance_matrix(
            &mut out,
            &b.read().unwrap(),
            3
        ));
        assert!(!get_instanced_mesh_instance_matrix(
            &mut out,
            &b.read().unwrap(),
            -1
        ));
        assert_eq!(out.m[12], 42.0);
    }
}
mod get_instanced_mesh_signals {
    use super::*;
    #[test]
    fn returns_null_until_enabled_then_the_original_group() {
        let b = batch(&[1.0]);
        assert!(get_instanced_mesh_signals(&b.read().unwrap()).is_none());
        let s = enable_instanced_mesh_signals(&b);
        assert!(Arc::ptr_eq(
            &s,
            &get_instanced_mesh_signals(&b.read().unwrap()).unwrap()
        ));
    }
}
mod initialize_instanced_mesh_signals {
    use super::*;
    #[test]
    fn replaces_all_slots_and_preserves_the_entity_uid() {
        let s = create_instanced_mesh_signals();
        let mut s = s.write().unwrap();
        flight_entity::set_entity_uid(&mut *s, "kept".to_string());
        initialize_instanced_mesh_signals(&mut s);
        assert!(s.on_cleared.data.read().unwrap().is_none());
        assert!(s.on_instance_appended.data.read().unwrap().is_none());
        assert!(s.on_instance_removed.data.read().unwrap().is_none());
        assert_eq!(flight_entity::get_entity_uid(&mut *s), "kept");
    }
}
mod invalidate_instanced_mesh {
    use super::*;
    #[test]
    fn bumps_version_once() {
        let b = batch(&[1.0]);
        let old = b.read().unwrap().version;
        invalidate_instanced_mesh(&b);
        assert_eq!(b.read().unwrap().version, old + 1);
    }
}
mod is_instanced_mesh {
    use super::*;
    #[test]
    fn recognizes_an_actual_batch_and_rejects_null_empty_record_and_plain_mesh() {
        let b = batch(&[1.0]);
        assert!(is_instanced_mesh(&Some(Arc::new(as_node_ref(&b)))));
        assert!(!is_instanced_mesh(&None));
        assert!(!is_instanced_mesh(&Some(Arc::new(()))));
        assert!(!is_instanced_mesh(&Some(Arc::new(as_node_ref(
            &test_mesh()
        )))));
    }
}
mod iterate_instanced_mesh_instances {
    use super::*;
    #[test]
    fn visits_live_instances_in_order_using_the_original_matrix_allocations() {
        let b = batch(&[1.0, 2.0, 3.0]);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let original = b.clone();
        iterate_instanced_mesh_instances(
            &b,
            Arc::new(move |i, m| {
                assert!(Arc::ptr_eq(
                    m,
                    &original.read().unwrap().instance_matrices[i as usize]
                ));
                sink.lock().unwrap().push((i, m.read().unwrap().m[12]));
            }),
        );
        assert_eq!(*seen.lock().unwrap(), vec![(0, 1.0), (1, 2.0), (2, 3.0)]);
        let empty = batch(&[]);
        let visits = Arc::new(Mutex::new(0));
        let sink = visits.clone();
        iterate_instanced_mesh_instances(&empty, Arc::new(move |_, _| *sink.lock().unwrap() += 1));
        assert_eq!(*visits.lock().unwrap(), 0);
    }
}
mod remove_instanced_mesh_instance {
    use super::*;
    #[test]
    fn copies_last_into_hole_with_color_and_reports_swap_source_without_swapping_matrix_refs() {
        let b = batch(&[1.0, 2.0, 3.0]);
        let original = b.read().unwrap().instance_matrices[0].clone();
        set_instanced_mesh_instance_color(&b, 2, 0xabcdefff);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let signal = enable_instanced_mesh_signals(&b)
            .read()
            .unwrap()
            .on_instance_removed
            .clone();
        connect_signal(
            &signal,
            Arc::new(move |event| sink.lock().unwrap().push((event.index, event.swap_source))),
            None,
        );
        remove_instanced_mesh_instance(&b, 0);
        assert_eq!(b.read().unwrap().instance_count, 2);
        assert_eq!(translation_x(&b, 0), 3.0);
        assert_eq!(translation_x(&b, 1), 2.0);
        assert!(Arc::ptr_eq(
            &original,
            &b.read().unwrap().instance_matrices[0]
        ));
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 0),
            0xabcdefffu32 as f64
        );
        remove_instanced_mesh_instance(&b, 1);
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(translation_x(&b, 0), 3.0);
        assert_eq!(*seen.lock().unwrap(), vec![(0, 2), (1, -1)]);
        remove_instanced_mesh_instance(&b, 2);
        remove_instanced_mesh_instance(&b, -1);
        assert_eq!(b.read().unwrap().instance_count, 1);
    }
    #[test]
    fn ignores_the_count_boundary_and_removes_the_last_slot_without_touching_the_first() {
        let b = batch(&[1.0, 2.0]);
        let version = b.read().unwrap().version;
        remove_instanced_mesh_instance(&b, 2);
        remove_instanced_mesh_instance(&b, -1);
        assert_eq!(b.read().unwrap().instance_count, 2);
        assert_eq!(b.read().unwrap().version, version);
        assert_eq!(translation_x(&b, 0), 1.0);
        assert_eq!(translation_x(&b, 1), 2.0);
        remove_instanced_mesh_instance(&b, 1);
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(translation_x(&b, 0), 1.0);
    }
}
mod reserve_instanced_mesh {
    use super::*;
    #[test]
    fn grows_capacity_and_extends_colors_with_white_without_changing_count_or_version() {
        let b = batch(&[1.0]);
        set_instanced_mesh_instance_color(&b, 0, 0x11223344);
        let version = b.read().unwrap().version;
        reserve_instanced_mesh(&b, 64);
        assert!(get_instanced_mesh_capacity(&b.read().unwrap()) >= 64);
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(b.read().unwrap().version, version);
        set_instanced_mesh_instance_count(&b, 2);
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 0),
            0x11223344u32 as f64
        );
        assert_eq!(
            get_instanced_mesh_instance_color(&b.read().unwrap(), 1),
            4294967295.0
        );
        let b = create_instanced_mesh(bounded_geometry(), empty_materials(), Some(32), None);
        reserve_instanced_mesh(&b, 8);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), 32);
    }
}
mod set_instanced_mesh_instance_color {
    use super::*;
    #[test]
    fn allocates_colors_only_for_live_indices() {
        let b = batch(&[1.0]);
        assert!(b.read().unwrap().instance_colors.is_none());
        set_instanced_mesh_instance_color(&b, 5, 0x11223344);
        set_instanced_mesh_instance_color(&b, -1, 0x11223344);
        assert!(b.read().unwrap().instance_colors.is_none());
        set_instanced_mesh_instance_color(&b, 0, 0x11223344);
        assert!(b.read().unwrap().instance_colors.is_some());
    }
}
mod set_instanced_mesh_instance_count {
    use super::*;
    #[test]
    fn grows_to_fit_and_never_shrinks_capacity_when_count_lowers() {
        let b = create_instanced_mesh(bounded_geometry(), empty_materials(), Some(4), None);
        set_instanced_mesh_instance_count(&b, 10);
        assert_eq!(b.read().unwrap().instance_count, 10);
        assert!(get_instanced_mesh_capacity(&b.read().unwrap()) >= 10);
        let capacity = get_instanced_mesh_capacity(&b.read().unwrap());
        set_instanced_mesh_instance_count(&b, 1);
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), capacity);
    }
}
mod set_instanced_mesh_instance_matrix {
    use super::*;
    #[test]
    fn writes_only_live_indices_without_growing_or_throwing() {
        let b = batch(&[1.0]);
        set_instanced_mesh_instance_matrix(&b, 0, &translation(7.0, 0.0, 0.0));
        assert_eq!(translation_x(&b, 0), 7.0);
        set_instanced_mesh_instance_matrix(&b, 1, &translation(99.0, 0.0, 0.0));
        set_instanced_mesh_instance_matrix(&b, -1, &translation(99.0, 0.0, 0.0));
        assert_eq!(b.read().unwrap().instance_count, 1);
        assert_eq!(get_instanced_mesh_capacity(&b.read().unwrap()), 8);
        assert_eq!(translation_x(&b, 0), 7.0);
    }
}
mod set_instanced_mesh_instance_matrix_range {
    use super::*;
    #[test]
    fn writes_a_contiguous_run_and_invalidates_once() {
        let b = batch(&[0.0, 0.0, 0.0]);
        let mut source = vec![0.0; 32];
        source[..16].copy_from_slice(&translation(4.0, 0.0, 0.0).m);
        source[16..].copy_from_slice(&translation(5.0, 0.0, 0.0).m);
        let before = b.read().unwrap().version;
        set_instanced_mesh_instance_matrix_range(&b, 1, 2, &source);
        assert_eq!(translation_x(&b, 0), 0.0);
        assert_eq!(translation_x(&b, 1), 4.0);
        assert_eq!(translation_x(&b, 2), 5.0);
        assert_eq!(b.read().unwrap().version, before + 1);
    }
    #[test]
    fn refuses_ranges_past_live_count_or_insufficient_source() {
        let b = batch(&[1.0, 2.0]);
        set_instanced_mesh_instance_matrix_range(&b, 1, 2, &vec![0.0; 48]);
        assert_eq!(translation_x(&b, 1), 2.0);
        set_instanced_mesh_instance_matrix_range(&b, 0, 2, &vec![0.0; 16]);
        assert_eq!(translation_x(&b, 0), 1.0);
    }
}
