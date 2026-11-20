use super::*;
use std::ffi::{CStr, CString};
use std::sync::{Arc, Barrier, mpsc};
use std::time::Duration;

fn aliased_borrow_watchdog<T: Send + 'static>(operation: impl FnOnce() -> T + Send + 'static) -> T {
    let (sender, receiver) = mpsc::channel();
    let worker = std::thread::spawn(move || sender.send(operation()).unwrap());
    let value = receiver
        .recv_timeout(Duration::from_secs(2))
        .expect("generated FFI wrapper deadlocked while borrowing aliased handles");
    worker.join().unwrap();
    value
}

fn concurrent_borrow_watchdog(operations: Vec<Box<dyn FnOnce() + Send>>) {
    let operation_count = operations.len();
    let barrier = Arc::new(Barrier::new(operation_count + 1));
    let (sender, receiver) = mpsc::channel();
    let workers: Vec<_> = operations
        .into_iter()
        .map(|operation| {
            let barrier = barrier.clone();
            let sender = sender.clone();
            std::thread::spawn(move || {
                barrier.wait();
                operation();
                sender.send(()).unwrap();
            })
        })
        .collect();
    drop(sender);
    barrier.wait();
    for _ in 0..operation_count {
        receiver
            .recv_timeout(Duration::from_secs(10))
            .expect("generated FFI wrappers deadlocked under opposite-order concurrent borrowing");
    }
    for worker in workers {
        worker.join().unwrap();
    }
}

#[test]
fn node_carriers_preserve_identity_hierarchy_and_free_order() {
    unsafe {
        let parent = flight_create_display_object();
        let sprite = flight_create_sprite();
        let shape = flight_create_shape();
        let bitmap_text = flight_create_bitmap_text(std::ptr::null());
        let text_label = flight_create_text_label(std::ptr::null());
        assert!(!parent.is_null());
        assert!(!sprite.is_null());
        assert!(!shape.is_null());
        assert!(!bitmap_text.is_null());
        assert!(!text_label.is_null());

        let input = flight_node_array_create();
        for (index, node) in [sprite, shape, bitmap_text, text_label]
            .into_iter()
            .enumerate()
        {
            assert!(flight_node_array_push(input, node));
            assert_eq!(flight_node_array_len(input), index + 1);
        }
        flight_add_node_children(parent, input);
        flight_free_node_array(input);
        assert_eq!(flight_get_node_child_count(parent), 4);

        let output = flight_node_array_create();
        flight_get_node_children(output, parent);
        assert_eq!(flight_node_array_len(output), 4);
        let first = flight_node_array_get(output, 0);
        assert!(flight_node_equals(first, sprite));
        assert!(!flight_node_equals(first, shape));
        assert_eq!(
            std::sync::Arc::as_ptr(&(*first).node) as *const (),
            std::sync::Arc::as_ptr((*first).node2d.as_ref().unwrap()) as *const (),
        );
        assert!(flight_set_node2d_x(first, 3.5));
        assert_eq!(flight_get_node2d_x(sprite), 3.5);
        flight_free_node(first);

        let parent_view = flight_get_node_parent(sprite);
        assert!(flight_node_equals(parent_view, parent));
        assert_eq!(
            std::sync::Arc::as_ptr(&(*parent_view).node) as *const (),
            std::sync::Arc::as_ptr((*parent_view).node2d.as_ref().unwrap()) as *const (),
        );
        assert!(flight_set_node2d_x(parent_view, 8.25));
        assert_eq!(flight_get_node2d_x(parent), 8.25);
        flight_free_node(parent_view);

        let root_view = flight_get_node_root(text_label);
        assert!(flight_node_equals(root_view, parent));
        assert_eq!(
            std::sync::Arc::as_ptr(&(*root_view).node) as *const (),
            std::sync::Arc::as_ptr((*root_view).node2d.as_ref().unwrap()) as *const (),
        );
        assert_eq!(flight_get_node2d_x(root_view), 8.25);
        flight_free_node(root_view);

        let recovered_text_label = flight_node_array_get(output, 3);
        let recovered_text = CString::new("recovered-text").unwrap();
        flight_set_text_label_string(recovered_text_label, recovered_text.as_ptr());
        let recovered_text_copy = flight_get_text_label_string(recovered_text_label);
        assert!(!recovered_text_copy.is_null());
        assert_eq!(
            CStr::from_ptr(recovered_text_copy).to_bytes(),
            b"recovered-text"
        );
        flight_free_string(recovered_text_copy);
        flight_free_node(recovered_text_label);

        flight_set_node_child_index(parent, text_label, 0);
        flight_node_array_clear(output);
        flight_get_node_children(output, parent);
        let reordered = flight_node_array_get(output, 0);
        assert!(flight_node_equals(reordered, text_label));
        flight_free_node(reordered);

        let removed = flight_remove_node_child(parent, shape);
        assert!(flight_node_equals(removed, shape));
        assert_eq!(flight_get_node_child_count(parent), 3);
        flight_free_node(removed);

        flight_free_node_array(output);
        flight_free_node(parent);
        flight_free_node(sprite);
        flight_free_node(shape);
        flight_free_node(bitmap_text);
        flight_free_node(text_label);
        flight_free_node(std::ptr::null_mut());
        assert!(!flight_node_equals(std::ptr::null(), std::ptr::null()));
    }
}

#[test]
fn node_carriers_watchdog_aliased_ref_only_wrappers_finish_for_identical_cloned_and_distinct_handles()
 {
    unsafe {
        let body_a = flight_create_rigid_body2d();
        let body_b = flight_create_rigid_body2d();
        let same_allocation = Box::into_raw(Box::new(
            (&*body_a.cast::<flight_sdk::Ref<flight_sdk::RigidBody2D>>()).clone(),
        ))
        .cast::<std::ffi::c_void>();

        for (left, right) in [
            (body_a as usize, body_a as usize),
            (body_a as usize, same_allocation as usize),
            (body_a as usize, body_b as usize),
        ] {
            aliased_borrow_watchdog(move || {
                flight_apply_physics2d_impulse(
                    left as *mut std::ffi::c_void,
                    right as *mut std::ffi::c_void,
                    0.0,
                    0.0,
                    0.0,
                    0.0,
                    1.0,
                    0.0,
                );
            });
            aliased_borrow_watchdog(move || {
                let left = left as *const std::ffi::c_void;
                let right = right as *const std::ffi::c_void;
                let point = flight_sdk::Physics2DContactPoint::default();
                let _ = flight_is_rigid_body2d_pair_awake(left, right);
                let _ = flight_relative_normal_velocity(left, right, &point, 1.0, 0.0);
                let _ = flight_is_physics2d_pair_ordered(left, right);
            });
        }

        let node_a = flight_create_sprite();
        let node_b = flight_create_sprite();
        let aliases = flight_node_array_create();
        assert!(flight_node_array_push(aliases, node_a));
        assert_eq!(flight_node_array_len(aliases), 1);
        let node_a_alias = flight_node_array_get(aliases, 0);
        for (parent, child) in [
            (node_a as usize, node_a as usize),
            (node_a as usize, node_a_alias as usize),
            (node_a as usize, node_b as usize),
        ] {
            aliased_borrow_watchdog(move || {
                let _ = flight_default_node_runtime_can_add_child(
                    parent as *const FlightNode,
                    child as *const FlightNode,
                );
            });
        }

        flight_free_node_array(aliases);
        flight_free_node(node_a_alias);
        flight_free_node(node_a);
        flight_free_node(node_b);
        flight_free_rigid_body2_d_ref(
            same_allocation.cast::<flight_sdk::Ref<flight_sdk::RigidBody2D>>(),
        );
        flight_free_rigid_body2_d_ref(body_a.cast());
        flight_free_rigid_body2_d_ref(body_b.cast());
    }
}

#[test]
fn node_carriers_watchdog_concurrent_pairs_share_one_allocation_order() {
    const ITERATIONS: usize = 25_000;
    unsafe {
        let body_a = flight_create_rigid_body2d();
        let body_b = flight_create_rigid_body2d();
        let body_a_alias = Box::into_raw(Box::new(
            (&*body_a.cast::<flight_sdk::Ref<flight_sdk::RigidBody2D>>()).clone(),
        ))
        .cast::<std::ffi::c_void>();
        let (a, b, alias) = (body_a as usize, body_b as usize, body_a_alias as usize);

        // Opposite argument order must converge on the same allocation order for two writers.
        concurrent_borrow_watchdog(vec![
            Box::new(move || {
                for _ in 0..ITERATIONS {
                    flight_apply_physics2d_impulse(
                        a as *mut _,
                        b as *mut _,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    );
                }
            }),
            Box::new(move || {
                for _ in 0..ITERATIONS {
                    flight_apply_physics2d_impulse(
                        b as *mut _,
                        a as *mut _,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    );
                }
            }),
        ]);

        // A mutable pair and every shared pair run in opposite argument order. This is the
        // writer-preference deadlock that parameter-ordered shared locks used to permit.
        concurrent_borrow_watchdog(vec![
            Box::new(move || {
                for _ in 0..ITERATIONS {
                    flight_apply_physics2d_impulse(
                        a as *mut _,
                        b as *mut _,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    );
                }
            }),
            Box::new(move || {
                let point = flight_sdk::Physics2DContactPoint::default();
                for _ in 0..ITERATIONS {
                    let _ = flight_is_rigid_body2d_pair_awake(b as *const _, a as *const _);
                    let _ = flight_relative_normal_velocity(
                        b as *const _,
                        a as *const _,
                        &point,
                        1.0,
                        0.0,
                    );
                    let _ = flight_is_physics2d_pair_ordered(b as *const _, a as *const _);
                }
            }),
        ]);

        concurrent_borrow_watchdog(vec![
            Box::new(move || {
                let point = flight_sdk::Physics2DContactPoint::default();
                for _ in 0..ITERATIONS {
                    let _ = flight_is_rigid_body2d_pair_awake(a as *const _, b as *const _);
                    let _ = flight_relative_normal_velocity(
                        a as *const _,
                        b as *const _,
                        &point,
                        1.0,
                        0.0,
                    );
                    let _ = flight_is_physics2d_pair_ordered(a as *const _, b as *const _);
                }
            }),
            Box::new(move || {
                let point = flight_sdk::Physics2DContactPoint::default();
                for _ in 0..ITERATIONS {
                    let _ = flight_is_rigid_body2d_pair_awake(b as *const _, a as *const _);
                    let _ = flight_relative_normal_velocity(
                        b as *const _,
                        a as *const _,
                        &point,
                        1.0,
                        0.0,
                    );
                    let _ = flight_is_physics2d_pair_ordered(b as *const _, a as *const _);
                }
            }),
        ]);

        // Shared aliases must reuse the first guard. Several waiting writers make a second read of
        // the same writer-preferring RwLock deadlock deterministically if alias reuse regresses.
        let mut alias_operations: Vec<Box<dyn FnOnce() + Send>> = Vec::new();
        for writer_index in 0..3 {
            alias_operations.push(Box::new(move || {
                for _ in 0..ITERATIONS {
                    if writer_index % 2 == 0 {
                        flight_apply_physics2d_impulse(
                            a as *mut _,
                            b as *mut _,
                            0.0,
                            0.0,
                            0.0,
                            0.0,
                            1.0,
                            0.0,
                        );
                    } else {
                        flight_apply_physics2d_impulse(
                            b as *mut _,
                            a as *mut _,
                            0.0,
                            0.0,
                            0.0,
                            0.0,
                            1.0,
                            0.0,
                        );
                    }
                }
            }));
        }
        for reader_index in 0..3 {
            alias_operations.push(Box::new(move || {
                let point = flight_sdk::Physics2DContactPoint::default();
                let (left, right) = if reader_index % 2 == 0 {
                    (a, alias)
                } else {
                    (alias, a)
                };
                for _ in 0..ITERATIONS {
                    let _ = flight_is_rigid_body2d_pair_awake(left as *const _, right as *const _);
                    let _ = flight_relative_normal_velocity(
                        left as *const _,
                        right as *const _,
                        &point,
                        1.0,
                        0.0,
                    );
                    let _ = flight_is_physics2d_pair_ordered(left as *const _, right as *const _);
                }
            }));
        }
        concurrent_borrow_watchdog(alias_operations);

        let node_a = flight_create_sprite();
        let node_b = flight_create_sprite();
        let aliases = flight_node_array_create();
        assert!(flight_node_array_push(aliases, node_a));
        let node_a_alias = flight_node_array_get(aliases, 0);
        let (node_a_ptr, node_b_ptr, node_alias_ptr) =
            (node_a as usize, node_b as usize, node_a_alias as usize);
        let node_arc_a = (*node_a).node.clone();
        let node_arc_b = (*node_b).node.clone();
        concurrent_borrow_watchdog(vec![
            Box::new(move || {
                let a_before_b = (Arc::as_ptr(&node_arc_a) as *const () as usize)
                    < (Arc::as_ptr(&node_arc_b) as *const () as usize);
                for _ in 0..ITERATIONS {
                    if a_before_b {
                        let _first = node_arc_a
                            .write()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                        let _second = node_arc_b
                            .write()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                    } else {
                        let _first = node_arc_b
                            .write()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                        let _second = node_arc_a
                            .write()
                            .unwrap_or_else(std::sync::PoisonError::into_inner);
                    }
                }
            }),
            Box::new(move || {
                for _ in 0..ITERATIONS {
                    let _ = flight_default_node_runtime_can_add_child(
                        node_b_ptr as *const FlightNode,
                        node_a_ptr as *const FlightNode,
                    );
                }
            }),
            Box::new(move || {
                for _ in 0..ITERATIONS {
                    let _ = flight_default_node_runtime_can_add_child(
                        node_a_ptr as *const FlightNode,
                        node_alias_ptr as *const FlightNode,
                    );
                }
            }),
        ]);

        flight_free_node_array(aliases);
        flight_free_node(node_a_alias);
        flight_free_node(node_a);
        flight_free_node(node_b);
        flight_free_rigid_body2_d_ref(
            body_a_alias.cast::<flight_sdk::Ref<flight_sdk::RigidBody2D>>(),
        );
        flight_free_rigid_body2_d_ref(body_a.cast());
        flight_free_rigid_body2_d_ref(body_b.cast());
    }
}

#[test]
fn node_field_access_recovers_from_a_poisoned_view_lock() {
    unsafe {
        let sprite = flight_create_sprite();
        let node2d = (*sprite).node2d.clone().unwrap();
        let poison = node2d.clone();
        assert!(
            std::thread::spawn(move || {
                let _guard = poison.write().unwrap();
                panic!("poison the node2d view lock");
            })
            .join()
            .is_err()
        );
        assert!(node2d.is_poisoned());
        assert!(flight_set_node2d_x(sprite, 41.0));
        assert_eq!(flight_get_node2d_x(sprite), 41.0);
        flight_free_node(sprite);
    }
}

#[test]
fn node_field_mutation_is_locked_explicit_and_kind_safe() {
    unsafe {
        let sprite = flight_create_sprite();
        let before = [
            flight_get_node_appearance_revision(sprite),
            flight_get_node_local_bounds_revision(sprite),
            flight_get_node_local_content_revision(sprite),
            flight_get_node_local_transform_revision(sprite),
            flight_get_node_parent_reference_revision(sprite),
        ];
        assert!(flight_set_node_enabled(sprite, false));
        assert!(!flight_get_node_enabled(sprite));
        assert_eq!(
            [
                flight_get_node_appearance_revision(sprite),
                flight_get_node_local_bounds_revision(sprite),
                flight_get_node_local_content_revision(sprite),
                flight_get_node_local_transform_revision(sprite),
                flight_get_node_parent_reference_revision(sprite),
            ],
            before.map(|revision| revision.wrapping_add(1)),
            "the canonical SDK setter invalidates every node revision lane"
        );
        let after_sdk_enabled = [
            flight_get_node_appearance_revision(sprite),
            flight_get_node_local_bounds_revision(sprite),
            flight_get_node_local_content_revision(sprite),
            flight_get_node_local_transform_revision(sprite),
            flight_get_node_parent_reference_revision(sprite),
        ];
        assert!(flight_set_node_enabled_field(sprite, true));
        assert!(flight_get_node_enabled(sprite));
        assert_eq!(
            [
                flight_get_node_appearance_revision(sprite),
                flight_get_node_local_bounds_revision(sprite),
                flight_get_node_local_content_revision(sprite),
                flight_get_node_local_transform_revision(sprite),
                flight_get_node_parent_reference_revision(sprite),
            ],
            after_sdk_enabled,
            "the collision-only raw field setter does not invalidate"
        );
        assert!(flight_set_node2d_x(sprite, 12.5));
        assert_eq!(flight_get_node2d_x(sprite), 12.5);
        assert_eq!(
            flight_get_node_local_transform_revision(sprite),
            after_sdk_enabled[3]
        );
        flight_invalidate_node_local_transform(sprite);
        assert_eq!(
            flight_get_node_local_transform_revision(sprite),
            after_sdk_enabled[3].wrapping_add(1)
        );

        let name = CString::new("sprite-name").unwrap();
        assert!(flight_set_node_name(sprite, name.as_ptr()));
        let copied_name = flight_get_node_name(sprite);
        assert!(!copied_name.is_null());
        assert_eq!(CStr::from_ptr(copied_name).to_bytes(), b"sprite-name");
        flight_free_string(copied_name);
        assert!(flight_set_node_name(sprite, std::ptr::null()));
        assert!(flight_get_node_name(sprite).is_null());
        let invalid_utf8 = CString::from_vec_with_nul_unchecked(vec![0xff, 0]);
        assert!(!flight_set_node_name(sprite, invalid_utf8.as_ptr()));
        (*sprite)
            .node
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .node_fields_mut()
            .name = Some("interior\0nul".to_string());
        assert!(flight_get_node_name(sprite).is_null());
        assert!(flight_set_node_name(sprite, std::ptr::null()));

        let kind = CString::new("ffi-test-kind").unwrap();
        assert!(flight_set_node_kind(sprite, kind.as_ptr()));
        let copied_kind = flight_get_node_kind(sprite);
        assert_eq!(CStr::from_ptr(copied_kind).to_bytes(), b"ffi-test-kind");
        flight_free_string(copied_kind);

        assert!(!flight_has_node2d_blend_mode(sprite));
        assert_eq!(flight_get_node2d_blend_mode(sprite), -1);
        assert!(flight_set_node2d_blend_mode(sprite, 5, true));
        assert!(flight_has_node2d_blend_mode(sprite));
        assert_eq!(flight_get_node2d_blend_mode(sprite), 5);
        assert!(!flight_set_node2d_blend_mode(sprite, 99, true));
        assert_eq!(flight_get_node2d_blend_mode(sprite), 5);
        assert!(flight_set_node2d_blend_mode(sprite, 99, false));
        assert!(!flight_has_node2d_blend_mode(sprite));

        assert!(flight_get_text_label_string(sprite).is_null());
        assert_eq!(flight_get_node3d_position_x(sprite), 0.0);
        assert!(!flight_set_node3d_position_x(sprite, 7.0));
        assert_eq!(flight_get_node2d_x(sprite), 12.5);

        let node3d = flight_create_particle_emitter_3d();
        assert!(flight_set_node3d_position_x(node3d, 7.0));
        assert_eq!(flight_get_node3d_position_x(node3d), 7.0);
        let node3d_appearance = flight_get_node_appearance_revision(node3d);
        assert!(flight_set_node3d_alpha(node3d, 0.5));
        assert_eq!(flight_get_node3d_alpha(node3d), 0.5);
        assert_eq!(
            flight_get_node_appearance_revision(node3d),
            node3d_appearance.wrapping_add(1)
        );
        assert!(flight_set_node3d_alpha_field(node3d, 0.25));
        assert_eq!(flight_get_node3d_alpha(node3d), 0.25);
        assert_eq!(
            flight_get_node_appearance_revision(node3d),
            node3d_appearance.wrapping_add(1),
            "the node3d alpha field lane does not invalidate"
        );
        assert!(!flight_set_node3d_alpha(sprite, 0.5));
        assert!(!flight_set_node3d_alpha_field(sprite, 0.5));
        assert_eq!(flight_get_node2d_x(node3d), 0.0);
        assert!(!flight_set_node2d_x(node3d, 3.0));
        assert!(!flight_set_node2d_clip(node3d, std::ptr::null()));
        let clip_appearance = flight_get_node_appearance_revision(sprite);
        assert!(flight_set_node2d_clip(sprite, std::ptr::null()));
        assert_eq!(
            flight_get_node_appearance_revision(sprite),
            clip_appearance.wrapping_add(1),
            "the SDK clip setter invalidates appearance"
        );

        flight_free_node(node3d);
        flight_free_node(sprite);
    }
}

#[test]
fn node_field_optional_node2d_slice_preserves_null_elements_and_rejects_malformed_inputs() {
    unsafe {
        let sprite = flight_create_sprite();
        let node3d = flight_create_particle_emitter_3d();
        let artboard = flight_sdk::RiveArtboardGraph::default();
        let rebuilds: std::collections::HashMap<usize, flight_sdk::RiveRebuild> =
            Default::default();
        let range = flight_sdk::RiveObjectRange { end: 0, start: 0 };
        let call = |ptr: *const *const FlightNode, len: usize| {
            flight_create_rive_animation_clips(
                std::ptr::null(),
                0,
                &range,
                ptr,
                len,
                &artboard,
                (&rebuilds as *const std::collections::HashMap<usize, flight_sdk::RiveRebuild>)
                    .cast(),
                std::ptr::null(),
                std::ptr::null_mut(),
            )
        };

        let nodes = [
            std::ptr::null(),
            sprite as *const FlightNode,
            std::ptr::null(),
        ];
        let result = call(nodes.as_ptr(), nodes.len());
        assert!(!result.is_null(), "NULL elements lower to None");
        assert_eq!(flight_create_rive_animation_clips_result_len(result), 0);
        flight_create_rive_animation_clips_result_free(result.cast());

        let empty = call(std::ptr::null(), 0);
        assert!(!empty.is_null(), "NULL with zero length is an empty slice");
        flight_create_rive_animation_clips_result_free(empty.cast());
        assert!(
            call(std::ptr::null(), 2).is_null(),
            "NULL with non-zero length is rejected"
        );
        let wrong_kind = [sprite as *const FlightNode, node3d as *const FlightNode];
        assert!(
            call(wrong_kind.as_ptr(), wrong_kind.len()).is_null(),
            "a non-2D element is rejected before the SDK call"
        );

        flight_free_node(node3d);
        flight_free_node(sprite);
    }
}

#[test]
fn ref_only_struct_accessors_borrow_the_ref_handle() {
    unsafe {
        let clock = flight_create_clock();
        assert!(!clock.is_null());
        assert_eq!(flight_set_clock_elapsed(clock, 4.25), 4.25);
        assert_eq!(flight_get_clock_elapsed(clock), 4.25);
        assert!(flight_get_clock_parent(clock).is_null());
        flight_free_clock_ref(clock.cast::<flight_sdk::Ref<flight_sdk::Clock>>());
    }
}

#[test]
fn wrong_handle_and_null_ref_only_inputs_return_their_typed_sentinels() {
    unsafe {
        let sprite = flight_create_sprite();
        let mut page_count = usize::MAX;
        assert!(flight_get_bitmap_text_pages(sprite, &mut page_count).is_null());
        assert_eq!(page_count, usize::MAX);

        let mut first = i32::MAX;
        let mut second = i32::MAX;
        assert!(!flight_get_index_range_for_cluster(
            std::ptr::null(),
            0,
            0,
            &mut first,
            &mut second,
        ));
        assert_eq!((first, second), (i32::MAX, i32::MAX));
        flight_free_node(sprite);
    }
}
