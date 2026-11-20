use std::ffi::{CStr, c_char};
use std::future::Future;
use std::ptr::{NonNull, null, null_mut};
use std::sync::{Arc, Barrier, Mutex, RwLock};
use std::task::{Context, Poll, Waker};

use flight_sdk::render_wgpu::contract::{
    WgpuRenderStateOptions, WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_render_state,
    end_wgpu_render_pass, register_wgpu_bitmap_texture_resolver, submit_wgpu_frame,
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
        render_known_scene(unsafe { &*device }, unsafe { &*target });
        let bitmap =
            unsafe { flight_create_bitmap_from_headless_screen_render_target(target, 10_000) };
        assert!(!bitmap.is_null());
        assert_eq!(
            count_mismatched_pixels(unsafe { &*bitmap }, &create_known_scene_pixels(), 0),
            0
        );
        unsafe { flight_free_bitmap(bitmap) };
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
        let lent: &WgpuRenderTarget = unsafe { &*first };
        let WgpuRenderTarget::Screen(screen) = lent else {
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
        let capability = unsafe { &*flight_get_headless_host_wgpu_capability(host) };
        let acquired = block_on(flight_sdk::create_wgpu_acquisition(
            capability,
            unsafe { &*surface },
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
        let state = create_wgpu_render_state(unsafe { &*device }, None);
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

    // Destroying the host releases a lent target's GPU resources at once and destroys the
    // device, which a render state built over the lent device observes as device loss.
    #[test]
    fn releases_the_target_capture_and_destroys_the_device() {
        let Some(host) = create_test_host("releases_the_target_capture_and_destroys_the_device")
        else {
            return;
        };
        let target =
            unsafe { flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT) };
        let device = unsafe { flight_get_headless_host_wgpu_device(host) };
        render_known_scene(unsafe { &*device }, unsafe { &*target });
        let lent: &WgpuRenderTarget = unsafe { &*target };
        let WgpuRenderTarget::Screen(screen) = lent else {
            panic!("a lent render target is a screen target");
        };
        let screen = screen.clone();
        assert!(screen.read().unwrap().capture_buffer.is_some());
        let state = create_wgpu_render_state(unsafe { &*device }, None);
        unsafe { flight_destroy_headless_host(host) };
        {
            let screen = screen.read().unwrap();
            assert!(screen.capture_buffer.is_none() && screen.capture_texture.is_none());
            assert!(screen.presentation_view.is_none());
        }
        let native = flight_sdk::render_wgpu::contract::get_wgpu_render_state_native_device(&state);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let lost = loop {
            let _ = native.device.poll(wgpu::PollType::Poll);
            if let Some(lost) = flight_sdk::render_wgpu::contract::get_wgpu_device_loss(&state) {
                break lost;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the device loss never settled"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        };
        assert_eq!(
            lost.reason,
            flight_sdk::render_wgpu::contract::WgpuDeviceLostReason::Destroyed
        );
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
        render_known_scene(unsafe { &*device }, unsafe { &*target });
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
        assert!((unsafe { &*capability }.is_supported)());
        assert_eq!(
            unsafe { flight_is_headless_host_software_adapter(host) },
            take_string(unsafe { flight_get_headless_host_adapter_name(host) })
                .contains("llvmpipe")
        );
        unsafe { flight_destroy_headless_host(host) };
    }
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

fn take_string(text: *mut c_char) -> String {
    assert!(!text.is_null());
    let owned = unsafe { CStr::from_ptr(text) }
        .to_string_lossy()
        .into_owned();
    unsafe { flight_free_string(text) };
    return owned;
}

const SCENE_CLEAR: u32 = 0x204080ff;
const SCENE_HEIGHT: u32 = 48;
const SCENE_SPRITES: [(u32, u32, u32, u32, u32); 2] =
    [(0xff0000ff, 8, 6, 16, 12), (0x00ff00ff, 30, 20, 20, 24)];
const SCENE_WIDTH: u32 = 64;
