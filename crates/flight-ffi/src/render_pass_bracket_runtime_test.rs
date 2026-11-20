use std::cell::RefCell;
use std::ffi::c_void;
use std::future::Future;
use std::ptr::{NonNull, null, null_mut};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier, Mutex, RwLock};
use std::task::{Context, Poll, Waker};
use std::time::Duration;

use flight_sdk::entity::contract::get_entity_id;
use flight_sdk::render_wgpu::contract::{
    WgpuRenderPass, WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_native_device,
    create_wgpu_render_state, create_wgpu_texture_render_target, end_wgpu_render_pass,
    get_wgpu_render_state_runtime,
};

use crate::*;

mod flight_begin_wgpu_render_pass {
    use super::*;

    #[test]
    fn accepts_a_null_clear_as_load() {
        let scene = create_scene();
        let pass = unsafe { flight_begin_wgpu_render_pass(scene.state, &scene.target, null()) };
        assert!(!pass.is_null());
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn contains_a_panic_inside_the_sdk_begin_and_returns_null() {
        let scene = create_scene();
        set_wgpu_render_pass_fault(Some("begin"));
        assert!(scene_begin(&scene).is_null());
        // The SDK begin had pushed its record before the panic; the state keeps that partially
        // opened pass, which refuses later begins, and is released for every other call.
        assert_eq!(scene_record_ids(&scene).len(), 1);
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
        assert!(scene_begin(&scene).is_null());
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index: 0,
        });
        let pass = scene_begin(&scene);
        assert!(!pass.is_null());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn issues_exactly_one_handle_to_concurrent_begins_on_one_state() {
        let scene = create_scene();
        let state = scene.state.expose_provenance();
        let target = (&scene.target as *const WgpuRenderTarget).expose_provenance();
        let barrier = Arc::new(Barrier::new(8));
        let begins: Vec<_> = (0..8)
            .map(|_| {
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let clear = flight_sdk::RenderTargetClear::default();
                    barrier.wait();
                    let pass = unsafe {
                        flight_begin_wgpu_render_pass(
                            std::ptr::with_exposed_provenance_mut(state),
                            std::ptr::with_exposed_provenance(target),
                            &clear,
                        )
                    };
                    return pass.addr();
                })
            })
            .collect();
        let opened: Vec<usize> = begins
            .into_iter()
            .map(|begin| begin.join().unwrap())
            .filter(|pass| *pass != 0)
            .collect();
        assert_eq!(opened.len(), 1, "{opened:?}");
        assert_eq!(scene_record_ids(&scene).len(), 1);
        let pass = std::ptr::without_provenance_mut(opened[0]);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn opens_an_owned_open_handle_naming_the_state_and_its_pushed_record() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(!pass.is_null());
        let entry = pass_entry(pass);
        assert_eq!(entry.phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(entry.state, scene.state.addr());
        assert_eq!(entry.state_id, get_entity_id(scene_state(&scene)));
        assert_eq!(entry.index, 0);
        assert_eq!(scene_record_ids(&scene), [entry.record_id]);
        assert_eq!(
            get_wgpu_render_state_open_pass(scene.state),
            Some(pass.addr())
        );
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert!(scene_runtime(&scene).command_encoder.is_some());
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_null_for_a_null_state_or_target_without_touching_the_state() {
        let scene = create_scene();
        let clear = flight_sdk::RenderTargetClear::default();
        assert!(
            unsafe { flight_begin_wgpu_render_pass(null_mut(), &scene.target, &clear) }.is_null()
        );
        assert!(unsafe { flight_begin_wgpu_render_pass(scene.state, null(), &clear) }.is_null());
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert!(scene_runtime(&scene).current_render_target.is_none());
    }

    #[test]
    fn returns_null_for_a_second_begin_on_the_same_state_and_changes_nothing() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let before = scene_snapshot(&scene);
        assert!(scene_begin(&scene).is_null());
        assert_eq!(scene_snapshot(&scene), before);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_null_while_a_native_pass_is_open_and_leaves_it_untouched() {
        let scene = create_scene();
        let native = begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None);
        let index = native.index;
        let before = scene_snapshot(&scene);
        assert!(scene_begin(&scene).is_null());
        assert_eq!(scene_snapshot(&scene), before);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index,
        });
        assert!(scene_record_ids(&scene).is_empty());
    }
}

mod flight_destroy_wgpu_scene_2d_render {
    use super::*;

    #[test]
    fn leaves_the_proxies_untouched_while_a_pass_borrows_the_state() {
        let scene = create_scene();
        let proxies = scene_proxies_ptr(&scene);
        let pass = scene_begin(&scene);
        assert!(!unsafe { &*scene.proxies }.by_uid.is_empty());
        unsafe { flight_destroy_wgpu_scene_2d_render(scene.state, proxies) };
        assert!(!unsafe { &*scene.proxies }.by_uid.is_empty());
        unsafe { flight_destroy_wgpu_scene_2d_render(null_mut(), proxies) };
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_destroy_wgpu_scene_2d_render(scene.state, proxies) };
        assert!(unsafe { &*scene.proxies }.by_uid.is_empty());
    }
}

mod flight_end_wgpu_render_pass {
    use super::*;

    #[test]
    fn contains_a_panic_inside_the_sdk_end_and_leaves_the_handle_stale() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_wgpu_render_pass_fault(Some("end"));
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Stale);
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(!scene_render_2d(&scene, pass));
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(inspect_wgpu_render_pass(pass), None);
        // The fault fired before the SDK end ran, so its record is still open natively.
        assert_eq!(scene_record_ids(&scene).len(), 1);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index: 0,
        });
    }

    #[test]
    fn ends_once_and_leaves_an_ended_tombstone_for_the_one_free() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Ended);
        assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(!scene_render_2d(&scene, pass));
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Ended);
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(inspect_wgpu_render_pass(pass), None);
        let next = scene_begin(&scene);
        assert!(!next.is_null());
        assert!(unsafe { flight_end_wgpu_render_pass(next) });
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }

    #[test]
    fn returns_false_for_a_null_handle() {
        assert!(!unsafe { flight_end_wgpu_render_pass(null_mut()) });
    }

    #[test]
    fn validates_state_identity_before_any_pass_stack_inspection() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        take_wgpu_render_pass_validation_trace();
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert_eq!(
            take_wgpu_render_pass_validation_trace(),
            ["state_id", "pass_stack", "record_id", "top"]
        );
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn waits_below_a_native_inner_pass_then_ends_after_it_closes() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let outer = pass_entry(pass).record_id;
        let inner = begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None).index;
        let nested = scene_record_ids(&scene);
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(!scene_render_2d(&scene, pass));
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene), nested);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index: inner,
        });
        assert_eq!(scene_record_ids(&scene), [outer]);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(scene_record_ids(&scene).is_empty());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }
}

mod flight_free_wgpu_render_pass_handle {
    use super::*;

    #[test]
    fn contains_a_panic_inside_the_sdk_end_and_still_releases_the_handle() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_wgpu_render_pass_fault(Some("end"));
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(inspect_wgpu_render_pass(pass), None);
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
        end_wgpu_render_pass(WgpuRenderPass {
            state: scene_state_mut(&scene),
            index: 0,
        });
    }

    #[test]
    fn ends_an_open_top_pass_submitting_its_frame_before_releasing_it() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(scene_runtime(&scene).command_encoder.is_some());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(inspect_wgpu_render_pass(pass), None);
        assert!(scene_record_ids(&scene).is_empty());
        assert!(scene_runtime(&scene).command_encoder.is_none());
        assert!(scene_runtime(&scene).render_pass.is_none());
        assert!(scene_runtime(&scene).current_render_target.is_none());
        let next = scene_begin(&scene);
        assert!(!next.is_null());
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }

    #[test]
    fn ignores_a_null_handle() {
        unsafe { flight_free_wgpu_render_pass_handle(null_mut()) };
    }

    #[test]
    fn ignores_a_second_free_and_pointers_that_are_not_pass_handles() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        let next = scene_begin(&scene);
        assert!(!next.is_null());
        // Tokens are odd, so the even neighbour of a live token is never one.
        let foreign = [
            pass,
            scene_source_ptr(&scene)
                .cast_mut()
                .cast::<FfiWgpuRenderPassHandle>(),
            scene.state.cast::<FfiWgpuRenderPassHandle>(),
            NonNull::<FfiWgpuRenderPassHandle>::dangling().as_ptr(),
            std::ptr::without_provenance_mut(next.addr() + 1),
            std::ptr::without_provenance_mut(usize::MAX - 1),
        ];
        for handle in foreign {
            assert!(!scene_render_2d(&scene, handle));
            assert!(!unsafe { flight_end_wgpu_render_pass(handle) });
            unsafe { flight_free_wgpu_render_pass_handle(handle) };
        }
        assert_eq!(pass_entry(next).phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene).len(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(next) });
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }
}

mod flight_prepare_wgpu_scene_2d_render {
    use super::*;

    #[test]
    fn refuses_a_state_a_pass_borrows_or_another_call_holds() {
        let scene = create_scene();
        let proxies = scene_proxies_ptr(&scene);
        let source = scene_source_ptr(&scene);
        assert!(unsafe { flight_prepare_wgpu_scene_2d_render(scene.state, proxies, source) });
        assert!(!unsafe { flight_prepare_wgpu_scene_2d_render(null_mut(), proxies, source) });
        let pass = scene_begin(&scene);
        assert!(!unsafe { flight_prepare_wgpu_scene_2d_render(scene.state, proxies, source) });
        set_probe(Probe::CrossThread(CrossThreadCall {
            state: scene.state.expose_provenance(),
            pass: pass.addr(),
            target: (&scene.target as *const WgpuRenderTarget).expose_provenance(),
            proxies: proxies.expose_provenance(),
            source: source.expose_provenance(),
        }));
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(
            take_cross_thread(),
            Some(CrossThread {
                begin_null: true,
                render: false,
                end: false,
                prepare: false,
                still_busy: true,
            })
        );
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert!(unsafe { flight_prepare_wgpu_scene_2d_render(scene.state, proxies, source) });
    }
}

mod flight_render_wgpu_scene2d {
    use super::*;

    #[test]
    fn balances_a_native_nested_pass_back_to_the_original_top_record() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let original = pass_entry(pass).record_id;
        set_probe(Probe::Nest(scene.target.clone()));
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert_eq!(take_nested_depth(), 2);
        assert_eq!(scene_record_ids(&scene), [original]);
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn contains_a_panic_inside_the_draw_and_keeps_the_pass_open_for_reuse() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Panic);
        assert!(!scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert_eq!(scene_record_ids(&scene).len(), 1);
        set_probe(Probe::Count);
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        assert!(scene_record_ids(&scene).is_empty());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn draws_through_an_open_top_pass_and_returns_to_open() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Count);
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn rejects_same_handle_reentry_while_busy_and_completes_the_outer_call() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Reenter(pass));
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(
            take_reentry(),
            Some(Reentry {
                phase: FfiWgpuRenderPassPhase::Busy,
                render: false,
                end: false,
                freed_phase: Some(FfiWgpuRenderPassPhase::Busy)
            })
        );
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene).len(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn returns_false_for_a_null_required_argument_without_changing_the_pass() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        set_probe(Probe::Count);
        let before = scene_snapshot(&scene);
        let proxies = scene_proxies_ptr(&scene);
        let source = scene_source_ptr(&scene);
        assert!(!unsafe { flight_render_wgpu_scene2d(null_mut(), proxies, source, null()) });
        assert!(!unsafe { flight_render_wgpu_scene2d(pass, null_mut(), source, null()) });
        assert!(!unsafe { flight_render_wgpu_scene2d(pass, proxies, null(), null()) });
        assert_eq!(take_probe_calls(), 0);
        assert_eq!(scene_snapshot(&scene), before);
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Open);
        let transform = flight_sdk::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(unsafe { flight_render_wgpu_scene2d(pass, proxies, source, &transform) });
        assert_eq!(take_probe_calls(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
    }

    #[test]
    fn serializes_concurrent_draws_and_a_racing_free_on_one_handle() {
        let _exclusive = CONCURRENT_DRAWS_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let scene = create_scene_with(&CONCURRENT_RENDERER);
        let pass = scene_begin(&scene);
        CONCURRENT_ACTIVE.store(0, Ordering::SeqCst);
        CONCURRENT_MAX.store(0, Ordering::SeqCst);
        CONCURRENT_DRAWS.store(0, Ordering::SeqCst);
        let (handle, proxies, source) = (
            pass.addr(),
            scene_proxies_ptr(&scene).expose_provenance(),
            scene_source_ptr(&scene).expose_provenance(),
        );
        let barrier = Arc::new(Barrier::new(9));
        let drawers: Vec<_> = (0..8)
            .map(|_| {
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    let mut drawn = 0;
                    for _ in 0..40 {
                        let pass = std::ptr::without_provenance_mut(handle);
                        if unsafe {
                            flight_render_wgpu_scene2d(
                                pass,
                                std::ptr::with_exposed_provenance_mut(proxies),
                                std::ptr::with_exposed_provenance(source),
                                null(),
                            )
                        } {
                            drawn += 1;
                        }
                    }
                    return drawn;
                })
            })
            .collect();
        barrier.wait();
        std::thread::sleep(Duration::from_millis(20));
        let mut freed = false;
        while !freed {
            unsafe { flight_free_wgpu_render_pass_handle(pass) };
            freed = inspect_wgpu_render_pass(pass).is_none();
        }
        let drawn: usize = drawers
            .into_iter()
            .map(|drawer| drawer.join().unwrap())
            .sum();
        assert_eq!(
            CONCURRENT_MAX.load(Ordering::SeqCst),
            1,
            "two draws overlapped"
        );
        assert_eq!(CONCURRENT_DRAWS.load(Ordering::SeqCst), drawn);
        assert!(drawn > 0);
        assert!(scene_record_ids(&scene).is_empty());
        assert!(!is_wgpu_render_state_claimed(scene.state));
        assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
        assert!(!scene_render_2d(&scene, pass));
        assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
    }
}

mod registry_poisoning {
    use super::*;

    #[test]
    fn recovers_the_registry_and_keeps_every_operation_working() {
        poison_wgpu_render_passes();
        assert!(is_wgpu_render_pass_registry_poisoned());
        let scene = create_scene();
        let pass = scene_begin(&scene);
        assert!(!pass.is_null());
        assert!(scene_begin(&scene).is_null());
        set_probe(Probe::Count);
        assert!(scene_render_2d(&scene, pass));
        assert_eq!(take_probe_calls(), 1);
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert_eq!(inspect_wgpu_render_pass(pass), None);
        assert!(!is_wgpu_render_state_claimed(scene.state));
    }
}

mod released_token_reuse {
    use super::*;

    #[test]
    fn never_lets_a_released_handle_act_on_a_later_pass_on_the_same_state() {
        let scene = create_scene();
        let first = scene_begin(&scene);
        unsafe { flight_free_wgpu_render_pass_handle(first) };
        let second = scene_begin(&scene);
        assert!(!second.is_null());
        assert_ne!(second, first);
        set_probe(Probe::Count);
        assert!(!scene_render_2d(&scene, first));
        assert!(!unsafe { flight_end_wgpu_render_pass(first) });
        unsafe { flight_free_wgpu_render_pass_handle(first) };
        assert_eq!(take_probe_calls(), 0);
        assert_eq!(pass_entry(second).phase, FfiWgpuRenderPassPhase::Open);
        assert_eq!(scene_record_ids(&scene), [pass_entry(second).record_id]);
        assert!(scene_render_2d(&scene, second));
        assert!(unsafe { flight_end_wgpu_render_pass(second) });
        unsafe { flight_free_wgpu_render_pass_handle(second) };
    }
}

mod same_address_state_replacement {
    use super::*;

    #[test]
    fn rejects_the_old_handle_by_state_id_before_reading_the_replacement_pass_stack() {
        for operation in [Operation::Render, Operation::End, Operation::Free] {
            let scene = create_scene();
            let pass = scene_begin(&scene);
            let old = pass_entry(pass);
            let target = scene_replace_state(&scene);
            assert_ne!(get_entity_id(scene_state(&scene)), old.state_id);
            // The replacement has its own pass at the old index, so only the state identity
            // separates it from the original.
            let replacement = begin_wgpu_render_pass(scene_state_mut(&scene), &target, None).index;
            assert_eq!(replacement, old.index);
            let replaced = scene_snapshot(&scene);
            set_probe(Probe::Count);
            take_wgpu_render_pass_validation_trace();
            match operation {
                Operation::Render => assert!(!scene_render_2d(&scene, pass)),
                Operation::End => assert!(!unsafe { flight_end_wgpu_render_pass(pass) }),
                Operation::Free => unsafe { flight_free_wgpu_render_pass_handle(pass) },
            }
            assert_eq!(
                take_wgpu_render_pass_validation_trace(),
                ["state_id"],
                "{operation:?}"
            );
            assert_eq!(take_probe_calls(), 0);
            assert_eq!(scene_snapshot(&scene), replaced, "{operation:?}");
            assert_eq!(get_wgpu_render_state_open_pass(scene.state), None);
            if operation != Operation::Free {
                assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Stale);
                unsafe { flight_free_wgpu_render_pass_handle(pass) };
                assert_eq!(take_wgpu_render_pass_validation_trace(), Vec::<&str>::new());
            }
            assert_eq!(inspect_wgpu_render_pass(pass), None);
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: replacement,
            });
        }
    }

    #[test]
    fn releases_a_stale_open_bracket_when_the_replacement_begins_through_the_handle_api() {
        let scene = create_scene();
        let pass = scene_begin(&scene);
        let target = scene_replace_state(&scene);
        let clear = flight_sdk::RenderTargetClear::default();
        let next = unsafe { flight_begin_wgpu_render_pass(scene.state, &target, &clear) };
        assert!(!next.is_null());
        assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Stale);
        assert_eq!(
            get_wgpu_render_state_open_pass(scene.state),
            Some(next.addr())
        );
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        assert!(unsafe { flight_end_wgpu_render_pass(next) });
        unsafe { flight_free_wgpu_render_pass_handle(next) };
    }
}

mod same_index_record_replacement {
    use super::*;

    #[test]
    fn makes_a_stale_handle_that_never_draws_ends_or_pops_the_replacement() {
        for operation in [Operation::Render, Operation::End, Operation::Free] {
            let scene = create_scene();
            let pass = scene_begin(&scene);
            let original = pass_entry(pass).record_id;
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: 0,
            });
            let replacement =
                begin_wgpu_render_pass(scene_state_mut(&scene), &scene.target, None).index;
            assert_eq!(replacement, 0);
            let replaced = scene_record_ids(&scene);
            assert_ne!(replaced, [original]);
            set_probe(Probe::Count);
            take_wgpu_render_pass_validation_trace();
            match operation {
                Operation::Render => assert!(!scene_render_2d(&scene, pass)),
                Operation::End => assert!(!unsafe { flight_end_wgpu_render_pass(pass) }),
                Operation::Free => unsafe { flight_free_wgpu_render_pass_handle(pass) },
            }
            assert_eq!(
                take_wgpu_render_pass_validation_trace(),
                ["state_id", "pass_stack", "record_id"]
            );
            assert_eq!(take_probe_calls(), 0);
            assert_eq!(scene_record_ids(&scene), replaced, "{operation:?}");
            if operation != Operation::Free {
                assert_eq!(pass_entry(pass).phase, FfiWgpuRenderPassPhase::Stale);
                assert!(!unsafe { flight_end_wgpu_render_pass(pass) });
                assert!(!scene_render_2d(&scene, pass));
                unsafe { flight_free_wgpu_render_pass_handle(pass) };
                assert_eq!(scene_record_ids(&scene), replaced);
            }
            assert_eq!(inspect_wgpu_render_pass(pass), None);
            end_wgpu_render_pass(WgpuRenderPass {
                state: scene_state_mut(&scene),
                index: 0,
            });
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct CrossThread {
    begin_null: bool,
    render: bool,
    end: bool,
    prepare: bool,
    still_busy: bool,
}

// The addresses a draw hands to another thread so it can call into the bracket while the draw
// holds the state.
#[derive(Clone, Copy)]
struct CrossThreadCall {
    state: usize,
    pass: usize,
    target: usize,
    proxies: usize,
    source: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Operation {
    Render,
    End,
    Free,
}

enum Probe {
    Count,
    CrossThread(CrossThreadCall),
    Nest(WgpuRenderTarget),
    Panic,
    Reenter(*mut FfiWgpuRenderPassHandle),
}

#[derive(Debug, PartialEq, Eq)]
struct Reentry {
    phase: FfiWgpuRenderPassPhase,
    render: bool,
    end: bool,
    freed_phase: Option<FfiWgpuRenderPassPhase>,
}

// A heap render state on wgpu's noop backend with a texture target, a display object drawn by the
// given renderer, the FlightNode handle a C caller would hold for it, and its proxies. The state
// lives behind one raw pointer every access derives from, as a C caller's would, so the FFI handle
// and the test's native calls never hold competing borrows.
struct Scene {
    state: *mut flight_sdk::WgpuRenderState,
    target: WgpuRenderTarget,
    proxies: *mut WgpuProxies,
    source: flight_sdk::NodeRef,
    source_handle: Box<FlightNode>,
}

fn create_scene() -> Scene {
    return create_scene_with(&PROBE_RENDERER);
}

fn create_scene_with(
    renderer: &'static flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState>,
) -> Scene {
    take_probe_calls();
    take_wgpu_render_pass_validation_trace();
    set_wgpu_render_pass_fault(None);
    let state = Box::into_raw(Box::new(noop_render_state(renderer)));
    let target = create_texture_target(unsafe { &*state });
    let source: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let proxies = Box::into_raw(Box::new(WgpuProxies::default()));
    flight_sdk::prepare_scene_2d_render(unsafe { &mut *state }, unsafe { &mut *proxies }, &source);
    let source_handle = Box::new(ffi_node_from_node_ref(source.clone()));
    return Scene {
        state,
        target,
        proxies,
        source,
        source_handle,
    };
}

fn create_texture_target(state: &flight_sdk::WgpuRenderState) -> WgpuRenderTarget {
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state, 8.0, 8.0, None, None, None,
    ))));
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        std::thread::yield_now();
    }
}

// A render state on wgpu's noop backend whose display objects draw through `renderer`.
fn noop_render_state(
    renderer: &'static flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState>,
) -> flight_sdk::WgpuRenderState {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
        .expect("the noop device");
    let spawn = flight_sdk::HostSpawnCapability {
        provider: Arc::new("flight-ffi-test"),
        spawn: Arc::new(|_future| {}),
    };
    let device = flight_sdk::WgpuDevice {
        provider: Arc::new("flight-ffi-test"),
        handle: Arc::new(create_wgpu_native_device(device, queue, spawn)),
    };
    let mut state = create_wgpu_render_state(&device, None);
    flight_sdk::register_node_renderer(
        &mut state,
        flight_sdk::DISPLAY_OBJECT_KIND.to_string(),
        renderer,
    );
    return state;
}

fn pass_entry(pass: *mut FfiWgpuRenderPassHandle) -> FfiWgpuRenderPassEntry {
    return inspect_wgpu_render_pass(pass).expect("a live pass handle");
}

fn scene_begin(scene: &Scene) -> *mut FfiWgpuRenderPassHandle {
    let clear = flight_sdk::RenderTargetClear::default();
    return unsafe { flight_begin_wgpu_render_pass(scene.state, &scene.target, &clear) };
}

fn scene_proxies_ptr(scene: &Scene) -> *mut c_void {
    return scene.proxies.cast();
}

fn scene_record_ids(scene: &Scene) -> Vec<u64> {
    return scene_runtime(scene)
        .pass_stack
        .iter()
        .map(|record| get_entity_id(record))
        .collect();
}

fn scene_render_2d(scene: &Scene, pass: *mut FfiWgpuRenderPassHandle) -> bool {
    return unsafe {
        flight_render_wgpu_scene2d(
            pass,
            scene_proxies_ptr(scene),
            scene_source_ptr(scene),
            null(),
        )
    };
}

// Drops the state in place and writes a newly identified one at the same address, returning a
// target on the replacement's own device.
fn scene_replace_state(scene: &Scene) -> WgpuRenderTarget {
    let replacement = noop_render_state(&PROBE_RENDERER);
    unsafe {
        std::ptr::drop_in_place(scene.state);
        std::ptr::write(scene.state, replacement);
    }
    flight_sdk::prepare_scene_2d_render(
        scene_state_mut(scene),
        unsafe { &mut *scene.proxies },
        &scene.source,
    );
    return create_texture_target(scene_state(scene));
}

fn scene_runtime(scene: &Scene) -> &flight_sdk::render_wgpu::contract::WgpuRenderStateRuntime {
    return get_wgpu_render_state_runtime(scene_state(scene));
}

// What a lifecycle rejection must leave unchanged: the pass records, the encoder, the open
// pass encoder and the current target.
fn scene_snapshot(scene: &Scene) -> (Vec<u64>, bool, bool, bool) {
    let runtime = scene_runtime(scene);
    return (
        scene_record_ids(scene),
        runtime.command_encoder.is_some(),
        runtime.render_pass.is_some(),
        runtime.current_render_target.is_some(),
    );
}

fn scene_source_ptr(scene: &Scene) -> *const FlightNode {
    return &*scene.source_handle;
}

fn scene_state(scene: &Scene) -> &flight_sdk::WgpuRenderState {
    return unsafe { &*scene.state };
}

#[allow(clippy::mut_from_ref)]
fn scene_state_mut(scene: &Scene) -> &mut flight_sdk::WgpuRenderState {
    return unsafe { &mut *scene.state };
}

fn set_probe(probe: Probe) {
    PROBE.with(|slot| *slot.borrow_mut() = Some(probe));
}

// The display-object renderer the concurrency test draws through: it records how many draws run
// at once, holding each draw open briefly so overlapping draws would be observed.
fn submit_concurrent(
    _state: &mut flight_sdk::WgpuRenderState,
    _proxy: &flight_sdk::RenderProxy2D<flight_sdk::WgpuRenderState>,
) {
    let active = CONCURRENT_ACTIVE.fetch_add(1, Ordering::SeqCst) + 1;
    CONCURRENT_MAX.fetch_max(active, Ordering::SeqCst);
    std::thread::sleep(Duration::from_micros(200));
    CONCURRENT_DRAWS.fetch_add(1, Ordering::SeqCst);
    CONCURRENT_ACTIVE.fetch_sub(1, Ordering::SeqCst);
}

// The display-object renderer the bracket consumer reaches: it counts calls and, per the probe,
// nests a native pass, re-enters the bracket through the same handle, calls in from another
// thread, or panics.
fn submit_probe(
    state: &mut flight_sdk::WgpuRenderState,
    _proxy: &flight_sdk::RenderProxy2D<flight_sdk::WgpuRenderState>,
) {
    PROBE_CALLS.with(|calls| *calls.borrow_mut() += 1);
    let probe = PROBE.with(|probe| probe.borrow_mut().take());
    match probe {
        Some(Probe::Nest(target)) => {
            let inner = begin_wgpu_render_pass(state, &target, None).index;
            NESTED_DEPTH.with(|depth| {
                *depth.borrow_mut() = get_wgpu_render_state_runtime(state).pass_stack.len()
            });
            end_wgpu_render_pass(WgpuRenderPass {
                state,
                index: inner,
            });
        }
        Some(Probe::Panic) => panic!("probe panic"),
        Some(Probe::Reenter(pass)) => {
            let phase = pass_entry(pass).phase;
            let dangling = NonNull::<u8>::dangling().as_ptr().cast::<c_void>();
            let render =
                unsafe { flight_render_wgpu_scene2d(pass, dangling, dangling.cast(), null()) };
            let end = unsafe { flight_end_wgpu_render_pass(pass) };
            unsafe { flight_free_wgpu_render_pass_handle(pass) };
            let freed_phase = inspect_wgpu_render_pass(pass).map(|entry| entry.phase);
            REENTRY.with(|reentry| {
                *reentry.borrow_mut() = Some(Reentry {
                    phase,
                    render,
                    end,
                    freed_phase,
                });
            });
        }
        Some(Probe::CrossThread(call)) => {
            let observed = std::thread::spawn(move || {
                let state = std::ptr::with_exposed_provenance_mut::<flight_sdk::WgpuRenderState>(
                    call.state,
                );
                let pass = std::ptr::without_provenance_mut::<FfiWgpuRenderPassHandle>(call.pass);
                let target = std::ptr::with_exposed_provenance::<WgpuRenderTarget>(call.target);
                let proxies = std::ptr::with_exposed_provenance_mut::<c_void>(call.proxies);
                let source = std::ptr::with_exposed_provenance::<FlightNode>(call.source);
                return CrossThread {
                    begin_null: unsafe { flight_begin_wgpu_render_pass(state, target, null()) }
                        .is_null(),
                    render: unsafe { flight_render_wgpu_scene2d(pass, proxies, source, null()) },
                    end: unsafe { flight_end_wgpu_render_pass(pass) },
                    prepare: unsafe { flight_prepare_wgpu_scene_2d_render(state, proxies, source) },
                    still_busy: inspect_wgpu_render_pass(pass).map(|entry| entry.phase)
                        == Some(FfiWgpuRenderPassPhase::Busy),
                };
            })
            .join()
            .unwrap();
            CROSS_THREAD.with(|slot| *slot.borrow_mut() = Some(observed));
        }
        Some(Probe::Count) | None => {}
    }
}

fn take_cross_thread() -> Option<CrossThread> {
    return CROSS_THREAD.with(|slot| slot.borrow_mut().take());
}

fn take_nested_depth() -> usize {
    return NESTED_DEPTH.with(|depth| std::mem::take(&mut *depth.borrow_mut()));
}

fn take_probe_calls() -> usize {
    return PROBE_CALLS.with(|calls| std::mem::take(&mut *calls.borrow_mut()));
}

fn take_reentry() -> Option<Reentry> {
    return REENTRY.with(|reentry| reentry.borrow_mut().take());
}

static CONCURRENT_RENDERER: flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState> =
    flight_sdk::NodeRenderer {
        format: None,
        create_data: flight_sdk::noop_renderer_data,
        destroy_data: None,
        is_dirty: None,
        submit: submit_concurrent,
    };

static PROBE_RENDERER: flight_sdk::NodeRenderer<flight_sdk::WgpuRenderState> =
    flight_sdk::NodeRenderer {
        format: None,
        create_data: flight_sdk::noop_renderer_data,
        destroy_data: None,
        is_dirty: None,
        submit: submit_probe,
    };

// flight-lint: allow(hidden-state) test probe: the concurrency renderer's submit is a plain fn pointer shared by every drawing thread, so its overlap counters are process-wide and one lock keeps them to one test at a time
static CONCURRENT_ACTIVE: AtomicUsize = AtomicUsize::new(0);
// flight-lint: allow(hidden-state) test probe: the concurrency renderer's submit is a plain fn pointer shared by every drawing thread, so its overlap counters are process-wide and one lock keeps them to one test at a time
static CONCURRENT_DRAWS: AtomicUsize = AtomicUsize::new(0);
// flight-lint: allow(hidden-state) test probe: the concurrency renderer's submit is a plain fn pointer shared by every drawing thread, so its overlap counters are process-wide and one lock keeps them to one test at a time
static CONCURRENT_DRAWS_LOCK: Mutex<()> = Mutex::new(());
// flight-lint: allow(hidden-state) test probe: the concurrency renderer's submit is a plain fn pointer shared by every drawing thread, so its overlap counters are process-wide and one lock keeps them to one test at a time
static CONCURRENT_MAX: AtomicUsize = AtomicUsize::new(0);

// flight-lint: allow(hidden-state) test probe: the renderer submit is a plain fn pointer, so the probe action and its observations reach it per test thread
thread_local! {
    static CROSS_THREAD: RefCell<Option<CrossThread>> = const { RefCell::new(None) };
    static NESTED_DEPTH: RefCell<usize> = const { RefCell::new(0) };
    static PROBE: RefCell<Option<Probe>> = const { RefCell::new(None) };
    static PROBE_CALLS: RefCell<usize> = const { RefCell::new(0) };
    static REENTRY: RefCell<Option<Reentry>> = const { RefCell::new(None) };
}

type WgpuProxies = flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState>;

impl Drop for Scene {
    fn drop(&mut self) {
        set_probe(Probe::Count);
        set_wgpu_render_pass_fault(None);
        unsafe {
            drop(Box::from_raw(self.proxies));
            drop(Box::from_raw(self.state));
        }
    }
}
