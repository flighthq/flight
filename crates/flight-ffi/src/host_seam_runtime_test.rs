use std::ffi::{CStr, c_char};
use std::future::Future;
use std::ptr::{NonNull, null, null_mut};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Barrier, Mutex, RwLock};
use std::task::{Context, Poll, Waker};

use flight_sdk::render_wgpu::contract::{
    WgpuRenderStateOptions, WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_render_state,
    end_wgpu_render_pass, get_wgpu_render_state_native_device,
    register_wgpu_bitmap_texture_resolver, register_wgpu_render_state_teardown, submit_wgpu_frame,
};
use flight_sdk::scene2d_wgpu::contract::{
    register_wgpu_scene2d_renderer, register_wgpu_sprite_renderer, register_wgpu_standard_material,
    render_wgpu_scene2d,
};

use flight_sdk::Transform2DNode;

use crate::*;

mod flight_create_bitmap_from_headless_screen_render_target {
    use super::*;

    // The known scene drawn through the device and target the host lends, read back through the
    // host's own read-back, is exactly the analytically known frame.
    #[test]
    fn reads_back_a_scene_drawn_through_the_lent_device_and_target() {
        let Some(host) =
            create_test_host("reads_back_a_scene_drawn_through_the_lent_device_and_target")
        else {
            return;
        };
        let target =
            unsafe { flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        render_known_scene(&lent_device(device), &lent_target(target));
        let bitmap =
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 10_000) };
        assert!(!bitmap.is_null());
        assert_eq!(
            count_mismatched_pixels(
                &unsafe { &*(bitmap as *const flight_sdk::Ref<flight_sdk::Bitmap>) }
                    .read()
                    .unwrap(),
                &create_known_scene_pixels(),
                0
            ),
            0
        );
        unsafe { flight_free_bitmap_ref(bitmap.cast()) };
        unsafe { flight_destroy_headless_host(host) };
    }

    #[test]
    fn returns_null_before_any_frame_and_for_targets_no_live_host_lent() {
        let Some(host) =
            create_test_host("returns_null_before_any_frame_and_for_targets_no_live_host_lent")
        else {
            return;
        };
        let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) };
        assert!(
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 1_000) }
                .is_null()
        );
        let surface = unsafe { flight_create_headless_host_surface(host, 4, 4) };
        for foreign in [
            null(),
            surface.cast::<flight_sdk::WgpuRenderTarget>(),
            NonNull::<flight_sdk::WgpuRenderTarget>::dangling()
                .as_ptr()
                .cast_const(),
            target.wrapping_byte_add(1),
        ] {
            assert!(
                unsafe { flight_create_bitmap_from_headless_screen_render_target(foreign, 1_000) }
                    .is_null()
            );
            assert!(
                unsafe { flight_explain_headless_screen_render_target_read_back(foreign, 1_000) }
                    .is_null()
            );
        }
        unsafe { flight_destroy_headless_host(host) };
        assert!(
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 1_000) }
                .is_null()
        );
    }
}

mod flight_create_headless_host {
    use super::*;

    #[test]
    fn issues_distinct_odd_tokens_that_are_never_reissued() {
        let Some(first) = create_test_host("issues_distinct_odd_tokens_that_are_never_reissued")
        else {
            return;
        };
        unsafe { flight_destroy_headless_host(first) };
        let second = unsafe { flight_create_headless_host(null()) };
        assert!(!second.is_null());
        assert_ne!(first, second);
        assert_eq!(first.addr() % 2, 1);
        assert_eq!(second.addr() % 2, 1);
        assert!(unsafe { flight_is_headless_host_destroyed(first) });
        assert!(!unsafe { flight_is_headless_host_destroyed(second) });
        unsafe { flight_destroy_headless_host(second) };
    }

    #[test]
    fn returns_null_and_registers_nothing_when_no_backend_is_allowed() {
        let options = unsafe { flight_create_headless_host_options() };
        unsafe {
            flight_set_headless_host_options_allow_dx12(options, false);
            flight_set_headless_host_options_allow_metal(options, false);
            flight_set_headless_host_options_allow_vulkan(options, false);
        }
        assert!(unsafe { flight_create_headless_host(options) }.is_null());
        let explanation = unsafe { flight_explain_headless_host(options) };
        assert_eq!(
            unsafe { flight_get_headless_host_explanation_reason(explanation) },
            1
        );
        assert!(
            !take_string(unsafe { flight_get_headless_host_explanation_message(explanation) })
                .is_empty()
        );
        unsafe { flight_free_headless_host_explanation(explanation) };
        unsafe { flight_free_headless_host_options(options) };
    }

    #[test]
    fn serializes_concurrent_creation_and_destruction() {
        if create_test_host("serializes_concurrent_creation_and_destruction")
            .map(|host| unsafe { flight_destroy_headless_host(host) })
            .is_none()
        {
            return;
        }
        let barrier = Arc::new(Barrier::new(4));
        let tokens = Arc::new(Mutex::new(Vec::new()));
        let workers: Vec<_> = (0..4)
            .map(|_| {
                let barrier = barrier.clone();
                let tokens = tokens.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    let host = unsafe { flight_create_headless_host(null()) };
                    assert!(!host.is_null());
                    let target = unsafe { flight_create_headless_host_render_target(host, 2, 2) };
                    assert!(!target.is_null());
                    tokens.lock().unwrap().push(host.addr());
                    unsafe { flight_destroy_headless_host(host) };
                    unsafe { flight_destroy_headless_host(host) };
                    assert!(
                        unsafe {
                            flight_create_bitmap_from_headless_screen_render_target(target, 100)
                        }
                        .is_null()
                    );
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        let mut tokens = tokens.lock().unwrap().clone();
        tokens.sort_unstable();
        tokens.dedup();
        assert_eq!(tokens.len(), 4);
    }
}

mod flight_create_headless_host_options {
    use super::*;

    #[test]
    fn round_trips_every_field_and_refuses_an_unknown_power_preference() {
        let options = unsafe { flight_create_headless_host_options() };
        unsafe {
            assert!(flight_get_headless_host_options_allow_dx12(options));
            assert!(flight_get_headless_host_options_allow_metal(options));
            assert!(flight_get_headless_host_options_allow_software_adapter(
                options
            ));
            assert!(flight_get_headless_host_options_allow_vulkan(options));
            assert_eq!(
                flight_get_headless_host_options_power_preference(options),
                0
            );
            assert!(!flight_set_headless_host_options_allow_dx12(options, false));
            assert!(!flight_set_headless_host_options_allow_metal(
                options, false
            ));
            assert!(!flight_set_headless_host_options_allow_software_adapter(
                options, false
            ));
            assert!(!flight_set_headless_host_options_allow_vulkan(
                options, false
            ));
            assert_eq!(
                flight_set_headless_host_options_power_preference(options, 2),
                2
            );
            assert_eq!(
                flight_set_headless_host_options_power_preference(options, 9),
                2
            );
            assert!(!flight_get_headless_host_options_allow_dx12(options));
            assert!(!flight_get_headless_host_options_allow_metal(options));
            assert!(!flight_get_headless_host_options_allow_software_adapter(
                options
            ));
            assert!(!flight_get_headless_host_options_allow_vulkan(options));
            assert_eq!(
                flight_get_headless_host_options_power_preference(options),
                2
            );
            flight_free_headless_host_options(options);
            flight_free_headless_host_options(null_mut());
        }
    }
}

mod flight_create_headless_host_render_target {
    use super::*;

    #[test]
    fn lends_a_capture_enabled_screen_target_the_host_keeps() {
        let Some(host) = create_test_host("lends_a_capture_enabled_screen_target_the_host_keeps")
        else {
            return;
        };
        let first = unsafe { flight_create_headless_host_render_target(host, 6, 5) };
        let second = unsafe { flight_create_headless_host_render_target(host, 6, 5) };
        assert!(!first.is_null() && !second.is_null() && first != second);
        let lent = lent_target(first);
        let WgpuRenderTarget::Screen(screen) = &lent else {
            panic!("a lent render target is a screen target");
        };
        let screen = screen.read().unwrap();
        assert!(screen.capture_enabled);
        assert_eq!((screen.width, screen.height), (6, 5));
        drop(screen);
        assert_eq!(count_headless_host_carriers(host), Some((0, 2)));
        unsafe { flight_destroy_headless_host(host) };
        assert_eq!(count_headless_host_carriers(host), None);
        assert!(unsafe { flight_create_headless_host_render_target(host, 6, 5) }.is_null());
    }
}

mod flight_create_headless_host_surface {
    use super::*;

    #[test]
    fn lends_a_surface_with_the_requested_extent() {
        let Some(host) = create_test_host("lends_a_surface_with_the_requested_extent") else {
            return;
        };
        let surface = unsafe { flight_create_headless_host_surface(host, 7, 3) };
        assert!(!surface.is_null());
        let capability = ffi_resolve_headless_lent_capability(unsafe {
            flight_get_headless_host_wgpu_capability(host)
        })
        .unwrap();
        let capability = &capability;
        let acquired = block_on(flight_sdk::create_wgpu_acquisition(
            capability,
            &ffi_resolve_headless_lent_surface(surface).unwrap(),
            None,
        ))
        .expect("an immediate acquisition");
        assert_eq!(
            ((acquired.surface.width)(), (acquired.surface.height)()),
            (7.0, 3.0)
        );
        flight_sdk::release_wgpu_acquisition(capability, &acquired);
        assert_eq!(count_headless_host_carriers(host), Some((1, 0)));
        unsafe { flight_destroy_headless_host(host) };
        assert!(unsafe { flight_create_headless_host_surface(host, 7, 3) }.is_null());
    }
}

mod flight_destroy_headless_host {
    use super::*;

    // Destroying with carriers still lent frees them with the host; a render state built over the
    // lent device stays a valid value that observes the loss.
    #[test]
    fn frees_lent_carriers_and_fails_closed_for_stale_and_foreign_handles() {
        let Some(host) =
            create_test_host("frees_lent_carriers_and_fails_closed_for_stale_and_foreign_handles")
        else {
            return;
        };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let state = create_wgpu_render_state(&lent_device(device), None);
        let target = unsafe { flight_create_headless_host_render_target(host, 2, 2) };
        let _surface = unsafe { flight_create_headless_host_surface(host, 2, 2) };
        assert!(!target.is_null());
        assert_eq!(count_headless_host_carriers(host), Some((1, 1)));
        unsafe { flight_destroy_headless_host(host) };
        assert_eq!(count_headless_host_carriers(host), None);
        drop(state);
        // A live host during the checks: a stale or foreign handle must not reach it either.
        let other = unsafe { flight_create_headless_host(null()) };
        assert!(!other.is_null());
        for stale in [
            host,
            null_mut(),
            std::ptr::without_provenance_mut(host.addr() + 1),
            std::ptr::without_provenance_mut(usize::MAX),
            NonNull::<FfiHeadlessHostHandle>::dangling().as_ptr(),
            target.cast_mut().cast::<FfiHeadlessHostHandle>(),
        ] {
            unsafe { flight_destroy_headless_host(stale) };
            assert!(unsafe { flight_is_headless_host_destroyed(stale) });
            assert!(!unsafe { flight_is_headless_host_software_adapter(stale) });
            assert!(unsafe { flight_get_headless_host_wgpu_device(stale) }.is_null());
            assert!(unsafe { flight_get_headless_host_wgpu_capability(stale) }.is_null());
            assert!(unsafe { flight_get_headless_host_adapter_name(stale) }.is_null());
            assert!(unsafe { flight_get_headless_host_adapter_backend(stale) }.is_null());
            assert!(unsafe { flight_create_headless_host_surface(stale, 2, 2) }.is_null());
            assert!(unsafe { flight_create_headless_host_render_target(stale, 2, 2) }.is_null());
        }
        assert_eq!(count_headless_host_carriers(host), None);
        assert!(!unsafe { flight_is_headless_host_destroyed(other) });
        unsafe { flight_destroy_headless_host(other) };
    }
}

mod flight_destroy_headless_host_resources {
    use super::*;

    // A lent target nothing else holds is freed with its host.
    #[test]
    fn frees_a_target_nothing_else_holds_at_once() {
        let Some(host) = create_test_host("frees_a_target_nothing_else_holds_at_once") else {
            return;
        };
        let target =
            unsafe { flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        render_known_scene(&lent_device(device), &lent_target(target));
        let screen = match lent_target(target) {
            WgpuRenderTarget::Screen(screen) => Arc::downgrade(&screen),
            WgpuRenderTarget::Texture(_) => panic!("a lent render target is a screen target"),
        };
        unsafe { flight_destroy_headless_host(host) };
        assert!(screen.upgrade().is_none(), "the host kept its target alive");
    }

    // Destroying the host never destroys GPU storage under a dependent: a target and a device a
    // caller still holds keep working, and the device is torn down when the last of them drops.
    #[test]
    fn leaves_held_render_objects_drawing_and_frees_the_device_after_the_last() {
        let Some(host) = create_test_host(
            "leaves_held_render_objects_drawing_and_frees_the_device_after_the_last",
        ) else {
            return;
        };
        let target = lent_target(unsafe {
            flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT)
        });
        let device = lent_device(unsafe { flight_get_headless_host_wgpu_device(host) });
        let freed = watch_device_freed(&device);
        render_known_scene(&device, &target);
        unsafe { flight_destroy_headless_host(host) };
        let WgpuRenderTarget::Screen(screen) = &target else {
            panic!("a lent render target is a screen target");
        };
        assert!(screen.read().unwrap().capture_texture.is_some());
        render_known_scene(&device, &target);
        let bitmap = block_on(
            flight_sdk::render_wgpu::contract::create_bitmap_from_wgpu_screen_render_target(
                screen,
                Some(10_000),
            ),
        )
        .expect("a held target reads back after its host is destroyed");
        assert_eq!(
            count_mismatched_pixels(&bitmap, &create_known_scene_pixels(), 0),
            0
        );
        assert!(!is_device_freed(&device, &freed));
        drop(target);
        assert!(!is_device_freed(&device, &freed));
        let native = get_wgpu_render_state_native_device_of(&device);
        drop(device);
        let _ = native.device.poll(wgpu::PollType::wait_indefinitely());
        drop(native);
        assert!(
            freed.load(Ordering::SeqCst),
            "the device outlived its last dependent"
        );
    }

    // The reviewer's chain: a pass open on a non-empty scene when the host is destroyed draws,
    // ends and submits through the C ABI, its frame is the known one, and the state tears down.
    #[test]
    fn finishes_an_open_non_empty_pass_and_tears_its_state_down() {
        let Some(host) =
            create_test_host("finishes_an_open_non_empty_pass_and_tears_its_state_down")
        else {
            return;
        };
        let target =
            unsafe { flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let WgpuRenderTarget::Screen(screen) = lent_target(target) else {
            panic!("a lent render target is a screen target");
        };
        let scene = create_c_scene(device, create_known_scene_root());
        let pass =
            unsafe { flight_begin_wgpu_render_pass(scene.state, target, &known_scene_clear()) };
        assert!(!pass.is_null());
        unsafe { flight_destroy_headless_host(host) };
        assert!(unsafe {
            flight_render_wgpu_scene2d(pass, scene.proxies.cast(), &*scene.source, null())
        });
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_submit_wgpu_frame(scene.state) };
        let bitmap = block_on(
            flight_sdk::render_wgpu::contract::create_bitmap_from_wgpu_screen_render_target(
                &screen,
                Some(10_000),
            ),
        )
        .expect("the pass's frame reads back");
        assert_eq!(
            count_mismatched_pixels(&bitmap, &create_known_scene_pixels(), 0),
            0
        );
        assert!(unsafe { flight_begin_wgpu_render_pass(scene.state, target, null()) }.is_null());
        free_c_scene(scene);
    }
}

mod flight_destroy_wgpu_render_state {
    use super::*;

    // Real device loss under an open pass: the draw's validation panic is contained and poisons the
    // shape cache it was writing, yet the state still tears down and frees.
    #[test]
    fn tears_down_after_device_loss_poisons_a_shape_cache_mid_draw() {
        let Some(host) =
            create_test_host("tears_down_after_device_loss_poisons_a_shape_cache_mid_draw")
        else {
            return;
        };
        let target = unsafe { flight_create_headless_host_render_target(host, 8, 8) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let scene = create_c_scene(device, create_svg_scene_root());
        let pass = unsafe { flight_begin_wgpu_render_pass(scene.state, target, null()) };
        assert!(!pass.is_null());
        get_wgpu_render_state_native_device(unsafe { &*scene.state })
            .device
            .destroy();
        assert!(!unsafe {
            flight_render_wgpu_scene2d(pass, scene.proxies.cast(), &*scene.source, null())
        });
        assert!(
            count_poisoned_renderer_data(&scene) > 0,
            "the loss never reached a renderer cache"
        );
        unsafe { flight_end_wgpu_render_pass(pass) };
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_submit_wgpu_frame(scene.state) };
        unsafe { flight_destroy_wgpu_render_state(scene.state, scene.proxies.cast()) };
        assert!(
            flight_sdk::render_wgpu::contract::get_wgpu_render_state_runtime(unsafe {
                &*scene.state
            })
            .destroyed
        );
        assert!(
            unsafe { &*scene.proxies }
                .entries
                .iter()
                .all(Option::is_none)
        );
        free_c_scene(scene);
        unsafe { flight_destroy_headless_host(host) };
    }

    // A panic during a buffer write, with the device still live, leaves the cache and every other
    // lock teardown takes poisoned; the teardown recovers each one, destroys the buffers the cache
    // holds and releases the state's share of the device runtime.
    #[test]
    fn recovers_a_cache_a_panic_poisoned_during_its_buffer_write() {
        let Some(host) =
            create_test_host("recovers_a_cache_a_panic_poisoned_during_its_buffer_write")
        else {
            return;
        };
        let target = unsafe { flight_create_headless_host_render_target(host, 8, 8) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let scene = create_c_scene(device, create_svg_scene_root());
        let pass = unsafe { flight_begin_wgpu_render_pass(scene.state, target, null()) };
        assert!(unsafe {
            flight_render_wgpu_scene2d(pass, scene.proxies.cast(), &*scene.source, null())
        });
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        let data = renderer_data(&scene);
        assert!(!data.is_empty());
        let native = get_wgpu_render_state_native_device(unsafe { &*scene.state });
        for data in &data {
            poison(data);
        }
        let runtime = flight_sdk::render_wgpu::contract::get_wgpu_render_state_runtime(unsafe {
            &*scene.state
        });
        let context = runtime.context.clone();
        poison(&context);
        let render_runtime = flight_sdk::RenderState::render_runtime(unsafe { &*scene.state });
        let misses = render_runtime.registry_misses.clone();
        poison(&misses);
        poison(&render_runtime.registry_guard_log.clone());
        let buffers: Vec<wgpu::Buffer> = data.iter().flat_map(shape_buffers).collect();
        assert!(!buffers.is_empty());
        unsafe { flight_destroy_wgpu_render_state(scene.state, scene.proxies.cast()) };
        assert!(
            flight_sdk::render_wgpu::contract::get_wgpu_render_state_runtime(unsafe {
                &*scene.state
            })
            .destroyed
        );
        for buffer in &buffers {
            let error = capture_validation_error(&native, || {
                native.queue.write_buffer(buffer, 0, &[0; 4]);
            });
            assert!(
                error.is_some(),
                "a poisoned cache's buffer survived teardown"
            );
        }
        assert_eq!(
            context
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .references,
            0
        );
        drop(native);
        free_c_scene(scene);
        unsafe { flight_destroy_headless_host(host) };
    }

    // A panic inside teardown stays on the Rust side: the call returns, the state is torn down
    // once, a second destroy is a no-op, and the state still frees.
    #[test]
    fn contains_a_teardown_panic_and_tears_down_once() {
        let Some(host) = create_test_host("contains_a_teardown_panic_and_tears_down_once") else {
            return;
        };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let scene = create_c_scene(device, create_svg_scene_root());
        let runs = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counted = runs.clone();
        register_wgpu_render_state_teardown(
            unsafe { &mut *scene.state },
            Arc::new(move |_state: &mut flight_sdk::WgpuRenderState| {
                counted.fetch_add(1, Ordering::SeqCst);
                panic!("a teardown failed");
            }),
        );
        unsafe { flight_destroy_wgpu_render_state(scene.state, scene.proxies.cast()) };
        unsafe { flight_destroy_wgpu_render_state(scene.state, scene.proxies.cast()) };
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        assert!(
            flight_sdk::render_wgpu::contract::get_wgpu_render_state_runtime(unsafe {
                &*scene.state
            })
            .destroyed
        );
        free_c_scene(scene);
        unsafe { flight_destroy_headless_host(host) };
    }

    // Draws on states over a lent device race the host's destroy, repeatedly: every call returns,
    // and every state tears down and frees.
    #[test]
    fn tears_down_states_whose_draws_race_a_host_destroy() {
        if create_test_host("tears_down_states_whose_draws_race_a_host_destroy")
            .map(|host| unsafe { flight_destroy_headless_host(host) })
            .is_none()
        {
            return;
        }
        for round in 0..20 {
            let host = unsafe { flight_create_headless_host(null()) };
            let device = unsafe { flight_get_headless_host_wgpu_device(host) }.addr();
            let target = unsafe { flight_create_headless_host_render_target(host, 8, 8) }.addr();
            let barrier = Arc::new(Barrier::new(4));
            let workers: Vec<_> = (0..3)
                .map(|_| {
                    let barrier = barrier.clone();
                    std::thread::spawn(move || {
                        barrier.wait();
                        for _ in 0..6 {
                            let scene = create_c_scene(
                                std::ptr::without_provenance(device),
                                create_svg_scene_root(),
                            );
                            if scene.state.is_null() {
                                continue;
                            }
                            let pass = unsafe {
                                flight_begin_wgpu_render_pass(
                                    scene.state,
                                    std::ptr::without_provenance(target),
                                    null(),
                                )
                            };
                            if !pass.is_null() {
                                unsafe {
                                    flight_render_wgpu_scene2d(
                                        pass,
                                        scene.proxies.cast(),
                                        &*scene.source,
                                        null(),
                                    );
                                    flight_end_wgpu_render_pass(pass);
                                    flight_free_wgpu_render_pass_handle(pass);
                                    flight_submit_wgpu_frame(scene.state);
                                }
                            }
                            unsafe {
                                flight_destroy_wgpu_render_state(scene.state, scene.proxies.cast())
                            };
                            assert!(
                                flight_sdk::render_wgpu::contract::get_wgpu_render_state_runtime(
                                    unsafe { &*scene.state }
                                )
                                .destroyed
                            );
                            free_c_scene(scene);
                        }
                    })
                })
                .collect();
            barrier.wait();
            std::thread::sleep(std::time::Duration::from_millis(round % 5));
            unsafe { flight_destroy_headless_host(host) };
            for worker in workers {
                worker.join().unwrap();
            }
        }
    }
}

mod flight_explain_headless_host {
    use super::*;

    #[test]
    fn reports_ready_with_the_adapter_creation_opens() {
        let Some(host) = create_test_host("reports_ready_with_the_adapter_creation_opens") else {
            return;
        };
        let explanation = unsafe { flight_explain_headless_host(null()) };
        assert_eq!(
            unsafe { flight_get_headless_host_explanation_reason(explanation) },
            0
        );
        assert_eq!(
            take_string(unsafe { flight_get_headless_host_explanation_adapter_name(explanation) }),
            take_string(unsafe { flight_get_headless_host_adapter_name(host) })
        );
        assert_eq!(
            take_string(unsafe {
                flight_get_headless_host_explanation_adapter_backend(explanation)
            }),
            take_string(unsafe { flight_get_headless_host_adapter_backend(host) })
        );
        unsafe { flight_free_headless_host_explanation(explanation) };
        unsafe { flight_destroy_headless_host(host) };
        assert!(unsafe { flight_get_headless_host_explanation_message(null()) }.is_null());
        assert_eq!(
            unsafe { flight_get_headless_host_explanation_reason(null()) },
            1
        );
    }
}

mod flight_explain_headless_screen_render_target_read_back {
    use super::*;

    #[test]
    fn says_no_frame_was_captured_then_ready_after_a_submitted_frame() {
        let Some(host) =
            create_test_host("says_no_frame_was_captured_then_ready_after_a_submitted_frame")
        else {
            return;
        };
        let target =
            unsafe { flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT) };
        let before =
            unsafe { flight_explain_headless_screen_render_target_read_back(target, 1_000) };
        assert_eq!(
            unsafe { flight_get_headless_read_back_explanation_reason(before) },
            2
        );
        unsafe { flight_free_headless_read_back_explanation(before) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        render_known_scene(&lent_device(device), &lent_target(target));
        let after =
            unsafe { flight_explain_headless_screen_render_target_read_back(target, 10_000) };
        assert_eq!(
            unsafe { flight_get_headless_read_back_explanation_reason(after) },
            0
        );
        assert_eq!(
            take_string(unsafe { flight_get_headless_read_back_explanation_message(after) }),
            ""
        );
        unsafe { flight_free_headless_read_back_explanation(after) };
        unsafe { flight_destroy_headless_host(host) };
    }
}

mod flight_get_headless_host_wgpu_device {
    use super::*;

    #[test]
    fn lends_one_stable_device_and_capability_per_host() {
        let Some(host) = create_test_host("lends_one_stable_device_and_capability_per_host") else {
            return;
        };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let capability = unsafe { flight_get_headless_host_wgpu_capability(host) };
        assert!(!device.is_null() && !capability.is_null());
        assert_eq!(device, unsafe {
            flight_get_headless_host_wgpu_device(host)
        });
        assert_eq!(capability, unsafe {
            flight_get_headless_host_wgpu_capability(host)
        });
        assert!((ffi_resolve_headless_lent_capability(capability)
            .unwrap()
            .is_supported)());
        assert_eq!(
            unsafe { flight_is_headless_host_software_adapter(host) },
            take_string(unsafe { flight_get_headless_host_adapter_name(host) })
                .contains("llvmpipe")
        );
        unsafe { flight_destroy_headless_host(host) };
    }
}

mod ffi_compose_registry_token {
    use super::*;

    #[test]
    fn places_the_sequence_above_the_tag_and_fails_closed_at_both_ends() {
        assert_eq!(ffi_compose_registry_token(0, 3), None);
        assert_eq!(ffi_compose_registry_token(1, 3), Some(0x103));
        let last = usize::MAX >> 8;
        assert_eq!(ffi_compose_registry_token(last, 11), Some(last << 8 | 11));
        assert_eq!(ffi_compose_registry_token(last + 1, 11), None);
        assert_eq!(ffi_compose_registry_token(usize::MAX, 1), None);
        assert!(ffi_is_registry_token(0x203, FFI_HEADLESS_HOST_TOKEN_TAG));
        assert!(!ffi_is_registry_token(0x203, FFI_RENDER_PASS_TOKEN_TAG));
        assert!(!ffi_is_registry_token(0x003, FFI_HEADLESS_HOST_TOKEN_TAG));
    }
}

mod ffi_mint_registry_token {
    use super::*;

    // An exhausted sequence mints nothing, so every producer that needs a token returns its
    // failure value and registers nothing.
    #[test]
    fn fails_every_producer_closed_when_the_sequence_is_exhausted() {
        let Some(host) =
            create_test_host("fails_every_producer_closed_when_the_sequence_is_exhausted")
        else {
            return;
        };
        let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) };
        let state = unsafe {
            flight_create_wgpu_render_state(flight_get_headless_host_wgpu_device(host), null())
        };
        assert!(!state.is_null());
        set_registry_token_sequence_exhausted_for_test(true);
        assert!(unsafe { flight_create_headless_host(null()) }.is_null());
        assert!(unsafe { flight_create_headless_host_surface(host, 4, 4) }.is_null());
        assert!(unsafe { flight_create_headless_host_render_target(host, 4, 4) }.is_null());
        assert!(unsafe { flight_begin_wgpu_render_pass(state, target, null()) }.is_null());
        set_registry_token_sequence_exhausted_for_test(false);
        assert_eq!(count_headless_host_carriers(host), Some((0, 1)));
        let pass = unsafe { flight_begin_wgpu_render_pass(state, target, null()) };
        assert!(!pass.is_null());
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_free_wgpu_render_state(state) };
        unsafe { flight_destroy_headless_host(host) };
    }
}

mod registry_token_families {
    use super::*;

    // Real tokens of every family, minted side by side, never share a value, and each one passed
    // where another family is expected is refused while every original stays live and usable.
    #[test]
    fn refuse_every_cross_cast_between_live_host_pass_and_lent_handles() {
        let Some(host) =
            create_test_host("refuse_every_cross_cast_between_live_host_pass_and_lent_handles")
        else {
            return;
        };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let capability = unsafe { flight_get_headless_host_wgpu_capability(host) };
        let surface = unsafe { flight_create_headless_host_surface(host, 4, 4) };
        let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) };
        let state = unsafe { flight_create_wgpu_render_state(device, null()) };
        let pass = unsafe { flight_begin_wgpu_render_pass(state, target, null()) };
        assert!(!pass.is_null());
        let tokens = [
            host.addr(),
            pass.addr(),
            device.addr(),
            capability.addr(),
            surface.addr(),
            target.addr(),
        ];
        let distinct: std::collections::BTreeSet<_> = tokens.iter().collect();
        assert_eq!(distinct.len(), tokens.len());
        let tags: std::collections::BTreeSet<_> = tokens.iter().map(|token| token & 0xff).collect();
        assert_eq!(tags.len(), tokens.len());
        for token in tokens.into_iter().filter(|token| *token != host.addr()) {
            let foreign = std::ptr::without_provenance_mut::<FfiHeadlessHostHandle>(token);
            assert!(unsafe { flight_is_headless_host_destroyed(foreign) });
            assert!(unsafe { flight_get_headless_host_wgpu_device(foreign) }.is_null());
            assert!(unsafe { flight_get_headless_host_adapter_name(foreign) }.is_null());
            assert!(unsafe { flight_create_headless_host_surface(foreign, 2, 2) }.is_null());
            unsafe { flight_destroy_headless_host(foreign) };
        }
        for token in tokens.into_iter().filter(|token| *token != pass.addr()) {
            let foreign = std::ptr::without_provenance_mut::<FfiWgpuRenderPassHandle>(token);
            assert!(!unsafe { flight_end_wgpu_render_pass(foreign) });
            unsafe { flight_free_wgpu_render_pass_handle(foreign) };
        }
        for token in tokens.into_iter().filter(|token| *token != device.addr()) {
            let foreign = std::ptr::without_provenance::<flight_sdk::WgpuDevice>(token);
            assert!(unsafe { flight_create_wgpu_render_state(foreign, null()) }.is_null());
        }
        for token in tokens.into_iter().filter(|token| *token != target.addr()) {
            let foreign = std::ptr::without_provenance::<WgpuRenderTarget>(token);
            assert!(
                unsafe { flight_create_bitmap_from_headless_screen_render_target(foreign, 0) }
                    .is_null()
            );
            assert!(unsafe { flight_begin_wgpu_render_pass(state, foreign, null()) }.is_null());
        }
        for token in tokens.into_iter().filter(|token| *token != surface.addr()) {
            assert!(
                ffi_resolve_headless_lent_surface(std::ptr::without_provenance(token)).is_none()
            );
        }
        for token in tokens
            .into_iter()
            .filter(|token| *token != capability.addr())
        {
            assert!(
                ffi_resolve_headless_lent_capability(std::ptr::without_provenance(token)).is_none()
            );
        }
        assert!(!unsafe { flight_is_headless_host_destroyed(host) });
        assert_eq!(count_headless_host_carriers(host), Some((1, 1)));
        assert!(unsafe { flight_end_wgpu_render_pass(pass) });
        unsafe { flight_free_wgpu_render_pass_handle(pass) };
        unsafe { flight_free_wgpu_render_state(state) };
        unsafe { flight_destroy_headless_host(host) };
    }
}

mod lent_carriers {
    use super::*;

    // After its host is destroyed, every lent carrier makes each SDK function that takes it return
    // its failure value without reading it, whether or not another host now lives at the address
    // the old host's storage used.
    #[test]
    fn fail_closed_in_every_consumer_after_destroy_and_host_churn() {
        let Some(host) =
            create_test_host("fail_closed_in_every_consumer_after_destroy_and_host_churn")
        else {
            return;
        };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        let capability = unsafe { flight_get_headless_host_wgpu_capability(host) };
        let surface = unsafe { flight_create_headless_host_surface(host, 4, 4) };
        let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) };
        let state = unsafe { flight_create_wgpu_render_state(device, null()) };
        unsafe { flight_destroy_headless_host(host) };
        let mut live = Vec::new();
        for _ in 0..200 {
            let next = unsafe { flight_create_headless_host(null()) };
            assert!(!next.is_null());
            let next_device = unsafe { flight_get_headless_host_wgpu_device(next) };
            assert_ne!(next_device, device);
            let next_target = unsafe { flight_create_headless_host_render_target(next, 2, 2) };
            assert_ne!(next_target, target);
            unsafe { flight_destroy_headless_host(next) };
            unsafe { flight_destroy_headless_host(next) };
            live.push(next);
        }
        let other = unsafe { flight_create_headless_host(null()) };
        assert!(unsafe { flight_create_wgpu_render_state(device, null()) }.is_null());
        assert!(unsafe { flight_create_wgpu_device_state(device) }.is_null());
        assert!(
            unsafe { flight_create_wgpu_screen_render_target(capability, device, surface, null()) }
                .is_null()
        );
        unsafe { flight_release_wgpu_acquisition(capability, null()) };
        unsafe { flight_resize_surface(null(), surface, 8.0, 8.0) };
        unsafe { flight_set_surface_display_size(null(), surface, 8.0, 8.0) };
        assert!(unsafe { flight_begin_wgpu_render_pass(state, target, null()) }.is_null());
        assert!(
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 0) }.is_null()
        );
        assert!(
            unsafe { flight_explain_headless_screen_render_target_read_back(target, 0) }.is_null()
        );
        for stale in live {
            assert!(unsafe { flight_get_headless_host_wgpu_device(stale) }.is_null());
        }
        unsafe { flight_free_wgpu_render_state(state) };
        unsafe { flight_destroy_headless_host(other) };
    }

    // Consumers racing a destroy either run on carriers they resolved first, which their clones keep
    // alive, or find the handles gone and return their failure value.
    #[test]
    fn stay_sound_while_a_destroy_races_their_consumers() {
        if create_test_host("stay_sound_while_a_destroy_races_their_consumers")
            .map(|host| unsafe { flight_destroy_headless_host(host) })
            .is_none()
        {
            return;
        }
        for _ in 0..20 {
            let host = unsafe { flight_create_headless_host(null()) };
            let device = unsafe { flight_get_headless_host_wgpu_device(host) }.addr();
            let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) }.addr();
            let barrier = Arc::new(Barrier::new(3));
            let workers: Vec<_> = (0..2)
                .map(|index| {
                    let barrier = barrier.clone();
                    std::thread::spawn(move || {
                        barrier.wait();
                        for _ in 0..10 {
                            if index == 0 {
                                let state = unsafe {
                                    flight_create_wgpu_render_state(
                                        std::ptr::without_provenance(device),
                                        null(),
                                    )
                                };
                                unsafe { flight_free_wgpu_render_state(state) };
                            } else {
                                let bitmap = unsafe {
                                    flight_create_bitmap_from_headless_screen_render_target(
                                        std::ptr::without_provenance(target),
                                        100,
                                    )
                                };
                                unsafe { flight_free_bitmap_ref(bitmap.cast()) };
                            }
                        }
                    })
                })
                .collect();
            barrier.wait();
            unsafe { flight_destroy_headless_host(std::ptr::without_provenance_mut(host.addr())) };
            for worker in workers {
                worker.join().unwrap();
            }
            assert!(
                unsafe {
                    flight_create_wgpu_render_state(std::ptr::without_provenance(device), null())
                }
                .is_null()
            );
        }
    }
}

mod ffi_optional_timeout_ms {
    use super::*;

    #[test]
    fn waits_without_limit_for_negative_and_clamps_past_u32() {
        assert_eq!(ffi_optional_timeout_ms(-1), None);
        assert_eq!(ffi_optional_timeout_ms(i64::MIN), None);
        assert_eq!(ffi_optional_timeout_ms(0), Some(0));
        assert_eq!(ffi_optional_timeout_ms(250), Some(250));
        assert_eq!(ffi_optional_timeout_ms(i64::from(u32::MAX)), Some(u32::MAX));
        assert_eq!(
            ffi_optional_timeout_ms(i64::from(u32::MAX) + 1),
            Some(u32::MAX)
        );
        assert_eq!(ffi_optional_timeout_ms(i64::MAX), Some(u32::MAX));
    }
}

mod inject_headless_host_fault {
    use super::*;

    // A panic at any host call point is contained: the call returns its failure value, nothing
    // unwinds across the C boundary, and the host stays usable afterwards.
    #[test]
    fn contains_a_panic_in_every_host_call_and_returns_its_failure_value() {
        let Some(host) =
            create_test_host("contains_a_panic_in_every_host_call_and_returns_its_failure_value")
        else {
            return;
        };
        let target = unsafe { flight_create_headless_host_render_target(host, 4, 4) };
        set_headless_host_fault(Some("create"));
        assert!(unsafe { flight_create_headless_host(null()) }.is_null());
        set_headless_host_fault(Some("explain"));
        assert!(unsafe { flight_explain_headless_host(null()) }.is_null());
        set_headless_host_fault(Some("read_back"));
        assert!(
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 0) }.is_null()
        );
        set_headless_host_fault(Some("explain_read_back"));
        assert!(
            unsafe { flight_explain_headless_screen_render_target_read_back(target, 0) }.is_null()
        );
        for call in 0..7 {
            set_headless_host_fault(Some("host"));
            match call {
                0 => assert!(unsafe { flight_get_headless_host_wgpu_device(host) }.is_null()),
                1 => assert!(unsafe { flight_get_headless_host_wgpu_capability(host) }.is_null()),
                2 => assert!(unsafe { flight_create_headless_host_surface(host, 2, 2) }.is_null()),
                3 => assert!(
                    unsafe { flight_create_headless_host_render_target(host, 2, 2) }.is_null()
                ),
                4 => assert!(unsafe { flight_get_headless_host_adapter_name(host) }.is_null()),
                5 => assert!(unsafe { flight_is_headless_host_destroyed(host) }),
                _ => assert!(!unsafe { flight_is_headless_host_software_adapter(host) }),
            }
        }
        set_headless_host_fault(None);
        assert!(!unsafe { flight_is_headless_host_destroyed(host) });
        assert!(!unsafe { flight_get_headless_host_wgpu_device(host) }.is_null());
        set_headless_host_fault(Some("destroy"));
        unsafe { flight_destroy_headless_host(host) };
        set_headless_host_fault(None);
        assert!(unsafe { flight_is_headless_host_destroyed(host) });
        assert!(
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 0) }.is_null()
        );
    }
}

// A render state over a lent device handle, made the way a C caller makes one, with the 2D preset
// and the known scene's renderers registered, its proxies prepared for `root`, and the FlightNode
// handle a C caller would hold for `root`. `state` is NULL when the device no longer resolves.
struct CScene {
    state: *mut flight_sdk::WgpuRenderState,
    proxies: *mut flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState>,
    source: Box<FlightNode>,
}

struct DeviceFreedGuard(Arc<std::sync::atomic::AtomicBool>);

fn create_c_scene(device: *const flight_sdk::WgpuDevice, root: flight_sdk::NodeRef) -> CScene {
    let options = WgpuRenderStateOptions {
        format: Some(wgpu::TextureFormat::Rgba8Unorm),
        ..WgpuRenderStateOptions::default()
    };
    let state = unsafe { flight_create_wgpu_render_state(device, &options) };
    let proxies = Box::into_raw(Box::default());
    if !state.is_null() {
        let state = unsafe { &mut *state };
        register_wgpu_standard_material(state);
        register_wgpu_bitmap_texture_resolver(state);
        flight_sdk::scene2d_wgpu::contract::register_wgpu_scene2d_render_preset(state);
        register_wgpu_sprite_renderer(state);
        flight_sdk::prepare_scene_2d_render(state, unsafe { &mut *proxies }, &root);
    }
    return CScene {
        state,
        proxies,
        source: Box::new(ffi_node_from_node_ref(root)),
    };
}

// The pixels of the known scene: a clear color and two solid opaque rectangles on whole pixels at
// their natural size, so every pixel is known exactly on any adapter.
fn create_known_scene_pixels() -> Vec<u8> {
    let mut out = SCENE_CLEAR
        .to_be_bytes()
        .repeat((SCENE_WIDTH * SCENE_HEIGHT) as usize);
    for (color, x, y, width, height) in SCENE_SPRITES {
        for row in y..y + height {
            for column in x..x + width {
                let offset = ((row * SCENE_WIDTH + column) * 4) as usize;
                out[offset..offset + 4].copy_from_slice(&color.to_be_bytes());
            }
        }
    }
    return out;
}

// The known scene's sprites under a display-object root.
// flight-lint: allow(f64) the SDK's 2D node transform fields are f64
fn create_known_scene_root() -> flight_sdk::NodeRef {
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    for (color, x, y, width, height) in SCENE_SPRITES {
        let sprite = flight_sdk::create_sprite();
        {
            let mut guard = sprite.write().unwrap();
            *guard.transform2d_mut().x = f64::from(x);
            *guard.transform2d_mut().y = f64::from(y);
            let source: flight_sdk::TextureSourceRef = Arc::new(RwLock::new(
                flight_sdk::create_bitmap(width, height, Some(color)),
            ));
            let mut texture = flight_sdk::create_texture_2d();
            texture.source = Some(source);
            guard.data.texture = Some(Arc::new(RwLock::new(flight_sdk::Texture::Texture2D(
                texture,
            ))));
        }
        let node: flight_sdk::NodeRef = sprite;
        flight_sdk::add_node_child(&root, &node);
    }
    return root;
}

// A filled SVG rectangle under a display-object root: drawn through the shape renderer, whose
// per-shape cache uploads GPU buffers on every draw.
fn create_svg_scene_root() -> flight_sdk::NodeRef {
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let shapes: flight_sdk::NodeRef = flight_sdk::create_scene2d_from_svg_document(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"><rect x=\"1\" y=\"1\" width=\"5\" height=\"5\" fill=\"#00ff00\"/></svg>",
        None,
        None,
    );
    flight_sdk::add_node_child(&root, &shapes);
    return root;
}

// A host on whatever adapter the machine offers, or `None` after printing why the calling test is
// skipped. Without any adapter the test skips; it never passes.
fn create_test_host(test: &str) -> Option<*mut FfiHeadlessHostHandle> {
    let host = unsafe { flight_create_headless_host(null()) };
    if host.is_null() {
        eprintln!(
            "SKIPPED {test}: no headless adapter. Install a software Vulkan adapter (Mesa lavapipe: mesa-vulkan-drivers) to run it."
        );
        return None;
    }
    return Some(host);
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

// Runs `operation` inside a validation error scope on `native` and returns the error it raised.
fn capture_validation_error(
    native: &flight_sdk::render_wgpu::contract::WgpuNativeDevice,
    operation: impl FnOnce(),
) -> Option<wgpu::Error> {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    operation();
    return block_on(scope.pop());
}

fn count_mismatched_pixels(actual: &flight_sdk::Bitmap, expected: &[u8], tolerance: u8) -> usize {
    assert_eq!((actual.width, actual.height), (SCENE_WIDTH, SCENE_HEIGHT));
    return actual
        .data
        .chunks(4)
        .zip(expected.chunks(4))
        .filter(|(got, want)| {
            return got
                .iter()
                .zip(want.iter())
                .any(|(got, want)| got.abs_diff(*want) > tolerance);
        })
        .count();
}

fn count_poisoned_renderer_data(scene: &CScene) -> usize {
    return renderer_data(scene)
        .iter()
        .filter(|data| data.is_poisoned())
        .count();
}

fn free_c_scene(scene: CScene) {
    if !scene.state.is_null() {
        unsafe { flight_free_wgpu_render_state(scene.state) };
    }
    drop(unsafe { Box::from_raw(scene.proxies) });
}

fn get_wgpu_render_state_native_device_of(
    device: &flight_sdk::WgpuDevice,
) -> flight_sdk::render_wgpu::contract::WgpuNativeDevice {
    return device
        .handle
        .downcast_ref::<flight_sdk::render_wgpu::contract::WgpuNativeDevice>()
        .expect("a headless device carries a native device")
        .clone();
}

// Whether wgpu freed the device `freed` watches, after letting its queue settle.
fn is_device_freed(device: &flight_sdk::WgpuDevice, freed: &std::sync::atomic::AtomicBool) -> bool {
    let _ = get_wgpu_render_state_native_device_of(device)
        .device
        .poll(wgpu::PollType::wait_indefinitely());
    return freed.load(Ordering::SeqCst);
}

fn known_scene_clear() -> flight_sdk::RenderTargetClear {
    let [red, green, blue, alpha] = SCENE_CLEAR.to_be_bytes();
    return flight_sdk::RenderTargetClear {
        color: Some([
            f32::from(red) / 255.0,
            f32::from(green) / 255.0,
            f32::from(blue) / 255.0,
            f32::from(alpha) / 255.0,
        ]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
}

// The device a lent device handle names while its host lives.
fn lent_device(handle: *const flight_sdk::WgpuDevice) -> flight_sdk::WgpuDevice {
    return ffi_resolve_headless_lent_device(handle).expect("a live lent device");
}

// The render target a lent render target handle names while its host lives.
fn lent_target(handle: *const WgpuRenderTarget) -> WgpuRenderTarget {
    return ffi_resolve_headless_lent_render_target(handle).expect("a live lent render target");
}

// Records that the device the guard watches was freed.
fn mark_device_freed(guard: &DeviceFreedGuard) {
    guard.0.store(true, Ordering::SeqCst);
}

// Leaves `lock` poisoned, as a panic while writing under it does.
fn poison<T: ?Sized>(lock: &RwLock<T>) {
    let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _writing = lock.write().unwrap();
        panic!("a write under the lock failed");
    }));
    assert!(poisoned.is_err() && lock.is_poisoned());
}

// flight-lint: allow(f64) the SDK's 2D node transform fields are f64
// Draws the known scene through the SDK's render sequence into `target`, on a render state built
// over `device`: create state, register renderers, prepare, begin pass, render, end pass, submit.
fn render_known_scene(device: &flight_sdk::WgpuDevice, target: &WgpuRenderTarget) {
    let mut state = create_wgpu_render_state(
        device,
        Some(&WgpuRenderStateOptions {
            format: Some(wgpu::TextureFormat::Rgba8Unorm),
            ..WgpuRenderStateOptions::default()
        }),
    );
    register_wgpu_standard_material(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    register_wgpu_scene2d_renderer(&mut state);
    register_wgpu_sprite_renderer(&mut state);
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    for (color, x, y, width, height) in SCENE_SPRITES {
        let sprite = flight_sdk::create_sprite();
        {
            let mut guard = sprite.write().unwrap();
            *guard.transform2d_mut().x = f64::from(x);
            *guard.transform2d_mut().y = f64::from(y);
            let source: flight_sdk::TextureSourceRef = Arc::new(RwLock::new(
                flight_sdk::create_bitmap(width, height, Some(color)),
            ));
            let mut texture = flight_sdk::create_texture_2d();
            texture.source = Some(source);
            guard.data.texture = Some(Arc::new(RwLock::new(flight_sdk::Texture::Texture2D(
                texture,
            ))));
        }
        let node: flight_sdk::NodeRef = sprite;
        flight_sdk::add_node_child(&root, &node);
    }
    let mut proxies = flight_sdk::RenderProxies2D::<flight_sdk::WgpuRenderState>::default();
    flight_sdk::prepare_scene_2d_render(&mut state, &mut proxies, &root);
    let [red, green, blue, alpha] = SCENE_CLEAR.to_be_bytes();
    let mut pass = begin_wgpu_render_pass(
        &mut state,
        target,
        Some(&flight_sdk::RenderTargetClear {
            color: Some([
                f32::from(red) / 255.0,
                f32::from(green) / 255.0,
                f32::from(blue) / 255.0,
                f32::from(alpha) / 255.0,
            ]),
            colors: None,
            depth: Some(1.0),
            stencil: None,
        }),
    );
    render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
    end_wgpu_render_pass(pass);
    submit_wgpu_frame(&mut state);
}

fn renderer_data(scene: &CScene) -> Vec<flight_sdk::RendererDataRef> {
    return unsafe { &*scene.proxies }
        .entries
        .iter()
        .flatten()
        .filter_map(|proxy| proxy.proxy.renderer_data.clone())
        .collect();
}

// The GPU buffers a shape cache holds for its mesh path.
fn shape_buffers(data: &flight_sdk::RendererDataRef) -> Vec<wgpu::Buffer> {
    let mut guard = data
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(shape) = flight_sdk::scene2d_wgpu::contract::get_wgpu_shape_data(&mut *guard) else {
        return Vec::new();
    };
    let buffers = &shape.mesh_buffers;
    return buffers
        .vertex_buffers
        .iter()
        .chain(&buffers.index_buffers)
        .chain(&buffers.uniform_buffers)
        .cloned()
        .collect();
}

fn take_string(text: *mut c_char) -> String {
    assert!(!text.is_null());
    let owned = unsafe { CStr::from_ptr(text) }
        .to_string_lossy()
        .into_owned();
    unsafe { flight_free_string(text) };
    return owned;
}

// Watches the device behind `device`: the returned flag turns true when wgpu frees it. The device's
// lost callback lives exactly as long as the device, so a guard it owns drops at that moment.
fn watch_device_freed(device: &flight_sdk::WgpuDevice) -> Arc<std::sync::atomic::AtomicBool> {
    let freed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let guard = DeviceFreedGuard(freed.clone());
    get_wgpu_render_state_native_device_of(device)
        .device
        .set_device_lost_callback(move |_, _| {
            let _ = &guard;
        });
    return freed;
}

const SCENE_CLEAR: u32 = 0x204080ff;

const SCENE_HEIGHT: u32 = 48;

const SCENE_SPRITES: [(u32, u32, u32, u32, u32); 2] =
    [(0xff0000ff, 8, 6, 16, 12), (0x00ff00ff, 30, 20, 20, 24)];

const SCENE_WIDTH: u32 = 64;

impl Drop for DeviceFreedGuard {
    fn drop(&mut self) {
        mark_device_freed(self);
    }
}
