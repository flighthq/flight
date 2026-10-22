use flight_render::RenderTargetClear;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_host::NativeSurfaceHandle;
use flight_render_wgpu::*;
use flight_surface::{HostWgpuCapability, SurfaceBase, SurfaceRef, allocate_surface};
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn count(counter: &AtomicU32) -> u32 {
    return counter.load(Ordering::SeqCst);
}

/// A screen target over a fresh test canvas the test keeps, so its context counters stay readable.
struct ScreenRig {
    canvas: Arc<TestCanvas>,
    host: HostWgpuCapability,
    record: Arc<TestWgpuHostRecord>,
    screen: Ref<WgpuScreenRenderTarget>,
}

fn create_screen_rig(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
    format: Option<wgpu::TextureFormat>,
) -> ScreenRig {
    let (host, record) = create_test_wgpu_host();
    let canvas = create_test_canvas(width, height);
    let surface = create_test_wgpu_surface(&canvas);
    let options = WgpuScreenRenderTargetOptions {
        format: Some(format.unwrap_or(state.format)),
        ..test_default()
    };
    let screen = create_wgpu_screen_render_target(&host, &state.device, &surface, Some(&options));
    return ScreenRig {
        canvas,
        host,
        record,
        screen: Arc::new(RwLock::new(screen)),
    };
}

// A surface whose drawable is not a canvas: the test host cannot present through it, the TS div.
fn create_non_canvas_surface() -> SurfaceRef {
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(NativeSurfaceHandle {
        provider: test_provider(),
        handle: Arc::new("div"),
    }));
    return surface;
}

// One whole frame into the screen: a pass that opens, clears and submits its own frame.
fn run_screen_frame(state: &mut WgpuRenderState, screen: &Ref<WgpuScreenRenderTarget>) {
    let clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    let target = WgpuRenderTarget::Screen(screen.clone());
    end_wgpu_render_pass(begin_wgpu_render_pass(state, &target, Some(&clear)));
}

// wgpu exposes no destroyed flag; a destroyed texture refuses a new view with a validation error.
fn is_texture_destroyed(device: &WgpuNativeDevice, texture: &wgpu::Texture) -> bool {
    let scope = device
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let _view = texture.create_view(&test_default());
    return block_on(scope.pop()).is_some_and(|error| error.to_string().contains("destroyed"));
}

mod bind_wgpu_screen_render_target {
    use super::*;

    // Nothing may hold a swap-chain view across frames, so the view is acquired inside the frame
    // and dropped when it is submitted.
    #[test]
    fn acquires_one_swap_chain_view_per_frame_and_releases_it_at_the_end_of_the_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 800, 600, None);
        let mut screen = rig.screen.write().unwrap();

        let first = bind_wgpu_screen_render_target(&mut state, &mut screen);
        assert_eq!(
            bind_wgpu_screen_render_target(&mut state, &mut screen),
            first
        );
        assert_eq!(screen.presentation_view, Some(first));
        assert_eq!(count(&rig.canvas.context.acquire_count), 1);

        end_wgpu_screen_render_target_frame(&mut screen);
        assert!(screen.presentation_view.is_none());
    }

    #[test]
    fn follows_a_surface_that_resized_between_frames() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 320, 240, None);

        rig.canvas.set_size(640, 480);
        let mut screen = rig.screen.write().unwrap();
        bind_wgpu_screen_render_target(&mut state, &mut screen);

        assert_eq!(screen.width, 640);
        assert_eq!(screen.height, 480);
        assert_eq!(screen.depth_stencil_texture.width(), 640);
    }

    #[test]
    fn draws_into_supersample_storage_when_the_target_is_antialiased() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, true, 400, 300);
        let mut screen = screen.write().unwrap();

        let view = bind_wgpu_screen_render_target(&mut state, &mut screen);

        assert_eq!(screen.width, 800);
        assert_eq!(Some(&view), screen.antialias_view.as_ref());
        assert_ne!(Some(&view), screen.presentation_view.as_ref());
        assert_eq!(
            screen
                .antialias_texture
                .as_ref()
                .map(|texture| texture.width()),
            Some(800)
        );
    }

    // D17: the target holds the acquired frame's lease for the whole frame, so a second pass into
    // the same screen within one frame reuses it rather than acquiring again.
    #[test]
    fn holds_one_acquired_frame_across_every_pass_of_a_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);

        begin_wgpu_frame(&mut state);
        run_screen_frame(&mut state, &rig.screen);
        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&rig.canvas.context.acquire_count), 1);
        assert_eq!(count(&rig.canvas.context.present_count), 0);
        submit_wgpu_frame(&mut state);

        assert_eq!(count(&rig.canvas.context.present_count), 1);
    }

    // D17: a timed-out acquisition skips the frame. It draws into unpresented scratch storage, and
    // the next frame acquires and presents normally without reconfiguring.
    #[test]
    fn skips_a_frame_whose_acquisition_timed_out() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let context = &rig.canvas.context;
        assert_eq!(count(&context.configure_count), 1);

        context.fail_next_acquire(WgpuCanvasFrameError::Timeout);
        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.acquire_count), 1);
        assert_eq!(count(&context.present_count), 0);
        assert!(rig.screen.read().unwrap().presentation_view.is_none());
        assert!(!is_wgpu_device_lost(&state));

        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.acquire_count), 2);
        assert_eq!(count(&context.present_count), 1);
        assert_eq!(count(&context.configure_count), 1);
    }

    // D17: an outdated surface skips the frame and reconfigures, at the surface's current extent,
    // before the next acquisition.
    #[test]
    fn skips_an_outdated_frame_and_reconfigures_before_the_next_acquire() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let context = &rig.canvas.context;

        context.fail_next_acquire(WgpuCanvasFrameError::Outdated);
        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.present_count), 0);
        assert_eq!(count(&context.configure_count), 1);

        rig.canvas.set_size(10, 6);
        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.configure_count), 2);
        let configuration = context.last_configuration().unwrap();
        assert_eq!((configuration.width, configuration.height), (10, 6));
        assert_eq!(count(&context.acquire_count), 2);
        assert_eq!(count(&context.present_count), 1);

        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.configure_count), 2);
    }

    // D17: a lost surface takes the device-lost path and presents nothing.
    #[test]
    fn reports_the_device_lost_when_the_surface_is_lost() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);

        rig.canvas
            .context
            .fail_next_acquire(WgpuCanvasFrameError::Lost);
        run_screen_frame(&mut state, &rig.screen);

        assert!(is_wgpu_device_lost(&state));
        assert_eq!(
            get_wgpu_device_loss(&state).map(|loss| loss.reason),
            Some(WgpuDeviceLostReason::Unknown)
        );
        assert_eq!(count(&rig.canvas.context.present_count), 0);
    }

    #[test]
    fn panics_when_the_presentation_texture_cannot_be_acquired() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);

        rig.canvas
            .context
            .fail_next_acquire(WgpuCanvasFrameError::OutOfMemory);
        let result = catch_unwind(AssertUnwindSafe(|| {
            bind_wgpu_screen_render_target(&mut state, &mut rig.screen.write().unwrap());
        }));
        assert!(panic_message(result.unwrap_err()).contains("out of memory"));

        let rig = create_screen_rig(&state, 8, 8, None);
        rig.canvas
            .context
            .fail_next_acquire(WgpuCanvasFrameError::Other);
        let result = catch_unwind(AssertUnwindSafe(|| {
            bind_wgpu_screen_render_target(&mut state, &mut rig.screen.write().unwrap());
        }));
        assert!(panic_message(result.unwrap_err()).contains("could not be acquired"));
    }
}

mod create_wgpu_screen_render_target {
    use super::*;

    // TS spied on context.configure; the test canvas context counts and keeps its configurations.
    #[test]
    fn configures_the_surface_context_and_declares_one_color_attachment() {
        let state = create_wgpu_render_state_for_test(None);
        let (host, _) = create_test_wgpu_host();
        let canvas = create_test_canvas(800, 600);
        let surface = create_test_wgpu_surface(&canvas);

        let screen = create_wgpu_screen_render_target(
            &host,
            &state.device,
            &surface,
            Some(&WgpuScreenRenderTargetOptions {
                format: Some(wgpu::TextureFormat::Rgba8Unorm),
                ..test_default()
            }),
        );

        assert_eq!(count(&canvas.context.configure_count), 1);
        assert_eq!(
            canvas.context.last_configuration().unwrap().format,
            wgpu::TextureFormat::Rgba8Unorm
        );
        assert_eq!(
            Arc::as_ptr(&get_test_canvas_context(&screen)) as *const u8,
            Arc::as_ptr(&canvas.context) as *const u8
        );
        assert_eq!(screen.color_attachments, 1);
        assert_eq!(screen.format, wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!(screen.width, 800);
        assert_eq!(screen.height, 600);
    }

    #[test]
    fn defaults_to_bgra8unorm_in_srgb() {
        let state = create_wgpu_render_state_for_test(None);
        let (host, _) = create_test_wgpu_host();
        let canvas = create_test_canvas(4, 4);
        let surface = create_test_wgpu_surface(&canvas);

        let screen = create_wgpu_screen_render_target(&host, &state.device, &surface, None);

        assert_eq!(screen.format, wgpu::TextureFormat::Bgra8Unorm);
        assert_eq!(screen.color_space, RenderTargetColorSpace::Srgb);
        assert_eq!(
            canvas.context.last_configuration().unwrap().format,
            wgpu::TextureFormat::Bgra8Unorm
        );
    }

    #[test]
    fn reports_a_surface_the_host_cannot_present_rather_than_returning_a_target_that_cannot_bind() {
        let state = create_wgpu_render_state_for_test(None);
        let (host, _) = create_test_wgpu_host();
        let unregistered_target = create_non_canvas_surface();

        let result = catch_unwind(AssertUnwindSafe(|| {
            create_wgpu_screen_render_target(&host, &state.device, &unregistered_target, None);
        }));

        assert!(panic_message(result.unwrap_err()).contains("cannot present WebGPU"));
    }
}

mod destroy_wgpu_screen_render_target {
    use super::*;

    // TS spied on each texture's destroy; a destroyed wgpu texture refuses new views instead.
    #[test]
    fn frees_the_storage_it_owns_and_unconfigures_the_context() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 800, 600, None);
        let mut screen = rig.screen.write().unwrap();
        enable_wgpu_screen_render_target_antialias(&mut screen);
        bind_wgpu_screen_render_target(&mut state, &mut screen);
        let device = screen.device.clone();
        let depth = screen.depth_stencil_texture.clone();
        let antialias = screen
            .antialias_texture
            .clone()
            .expect("supersample storage");
        assert!(!is_texture_destroyed(&device, &depth));
        assert!(!is_texture_destroyed(&device, &antialias));

        destroy_wgpu_screen_render_target(&mut screen);

        assert!(is_texture_destroyed(&device, &depth));
        assert!(is_texture_destroyed(&device, &antialias));
        assert_eq!(count(&rig.canvas.context.unconfigure_count), 1);
        assert!(screen.antialias_view.is_none());
        assert!(screen.antialias_texture.is_none());
        assert!(screen.presentation_view.is_none());
    }

    // D17: a frame still held at destroy is released unpresented.
    #[test]
    fn releases_a_held_frame_without_presenting_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let mut screen = rig.screen.write().unwrap();
        bind_wgpu_screen_render_target(&mut state, &mut screen);

        destroy_wgpu_screen_render_target(&mut screen);
        end_wgpu_screen_render_target_frame(&mut screen);

        assert_eq!(count(&rig.canvas.context.acquire_count), 1);
        assert_eq!(count(&rig.canvas.context.present_count), 0);
    }
}

mod end_wgpu_screen_render_target_frame {
    use super::*;

    #[test]
    fn is_what_a_submitted_frame_calls_leaving_no_view_behind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);

        run_screen_frame(&mut state, &screen);

        assert!(screen.read().unwrap().presentation_view.is_none());
        assert!(
            get_wgpu_render_state_runtime(&state)
                .frame_screen_target
                .is_none()
        );
    }

    // D17: the acquired frame is presented after the frame's submit, and exactly once.
    #[test]
    fn presents_the_acquired_frame_exactly_once_after_the_submit() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let context = &rig.canvas.context;

        begin_wgpu_frame(&mut state);
        run_screen_frame(&mut state, &rig.screen);
        assert_eq!(count(&context.present_count), 0);

        submit_wgpu_frame(&mut state);
        assert_eq!(count(&context.present_count), 1);
        assert_eq!(context.presented.lock().unwrap().len(), 1);

        submit_wgpu_frame(&mut state);
        end_wgpu_screen_render_target_frame(&mut rig.screen.write().unwrap());
        assert_eq!(count(&context.present_count), 1);
    }

    #[test]
    fn presents_a_frame_bound_outside_a_pass_and_drops_its_view() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let mut screen = rig.screen.write().unwrap();
        bind_wgpu_screen_render_target(&mut state, &mut screen);

        end_wgpu_screen_render_target_frame(&mut screen);

        assert!(screen.presentation_view.is_none());
        assert_eq!(count(&rig.canvas.context.present_count), 1);
        assert_eq!(rig.canvas.context.presented.lock().unwrap()[0].width(), 8);
    }
}

mod initialize_wgpu_screen_render_target {
    use super::*;

    #[test]
    fn attaches_through_the_host_and_sizes_from_the_surface() {
        let state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 320, 240, None);
        let canvas = create_test_canvas(640, 480);
        let surface = create_test_wgpu_surface(&canvas);
        let attaches = count(&rig.record.attach_count);
        let mut screen = rig.screen.write().unwrap();

        initialize_wgpu_screen_render_target(
            &mut screen,
            &rig.host,
            &state.device,
            &surface,
            Some(&WgpuScreenRenderTargetOptions {
                format: Some(wgpu::TextureFormat::Rgba8Unorm),
                ..test_default()
            }),
        );

        assert_eq!(count(&rig.record.attach_count), attaches + 1);
        assert_eq!(count(&canvas.context.configure_count), 1);
        assert_eq!(
            Arc::as_ptr(&get_test_canvas_context(&screen)) as *const u8,
            Arc::as_ptr(&canvas.context) as *const u8
        );
        assert_eq!(screen.format, wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!((screen.width, screen.height), (640, 480));
        assert_eq!(screen.depth_stencil_texture.width(), 640);
        assert_eq!(screen.depth_stencil_texture.height(), 480);
    }

    #[test]
    fn resets_every_per_frame_and_opt_in_slot() {
        let mut state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let mut screen = rig.screen.write().unwrap();
        enable_wgpu_screen_render_target_antialias(&mut screen);
        enable_wgpu_screen_render_target_capture(&mut screen);
        bind_wgpu_screen_render_target(&mut state, &mut screen);
        assert!(screen.presentation_view.is_some());
        let canvas = create_test_canvas(8, 8);
        let surface = create_test_wgpu_surface(&canvas);

        initialize_wgpu_screen_render_target(&mut screen, &rig.host, &state.device, &surface, None);

        assert!(!screen.antialias);
        assert!(screen.antialias_texture.is_none());
        assert!(screen.antialias_view.is_none());
        assert!(screen.antialias_resolve_bind_group.is_none());
        assert!(screen.acquire_antialias_view.is_none());
        assert!(screen.encode_antialias_resolve.is_none());
        assert!(!screen.capture_enabled);
        assert!(screen.capture_texture.is_none());
        assert!(screen.capture_buffer.is_none());
        assert!(screen.acquire_capture_texture.is_none());
        assert!(screen.encode_capture.is_none());
        assert_eq!(screen.capture_bytes_per_row, 0);
        assert_eq!((screen.capture_width, screen.capture_height), (0, 0));
        assert!(screen.presentation_view.is_none());
        assert_eq!(screen.color_attachments, 1);
        assert_eq!(screen.sample_count, 1);
    }

    #[test]
    fn keeps_the_entity_identity_of_the_target_it_rebuilds() {
        let state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let other = create_screen_rig(&state, 8, 8, None);
        let mut screen = rig.screen.write().unwrap();
        let id = get_entity_id(&*screen);
        assert_ne!(get_entity_id(&*other.screen.read().unwrap()), id);
        let canvas = create_test_canvas(16, 16);
        let surface = create_test_wgpu_surface(&canvas);

        initialize_wgpu_screen_render_target(&mut screen, &rig.host, &state.device, &surface, None);

        assert_eq!(get_entity_id(&*screen), id);
    }

    #[test]
    fn panics_when_the_host_cannot_present_the_surface() {
        let state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 8, 8, None);
        let unregistered_target = create_non_canvas_surface();

        let result = catch_unwind(AssertUnwindSafe(|| {
            initialize_wgpu_screen_render_target(
                &mut rig.screen.write().unwrap(),
                &rig.host,
                &state.device,
                &unregistered_target,
                None,
            );
        }));

        assert!(panic_message(result.unwrap_err()).contains("cannot present WebGPU"));
    }
}

mod is_wgpu_screen_render_target {
    use super::*;

    #[test]
    fn separates_the_two_realizations_by_the_field_that_says_where_the_pixels_live() {
        let state = create_wgpu_render_state_for_test(None);
        let screen = WgpuRenderTarget::Screen(create_wgpu_screen_render_target_for_test(
            &state, None, false, 800, 600,
        ));
        let texture = WgpuRenderTarget::Texture(Arc::new(RwLock::new(
            create_wgpu_texture_render_target(&state, 16.0, 16.0, None, None, None),
        )));

        assert!(is_wgpu_screen_render_target(&screen));
        assert!(!is_wgpu_screen_render_target(&texture));
    }
}

mod sync_wgpu_screen_render_target_extent {
    use super::*;

    #[test]
    fn follows_the_surface_without_a_resize_call() {
        let state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 320, 240, None);

        rig.canvas.set_size(500, 400);
        let mut screen = rig.screen.write().unwrap();
        sync_wgpu_screen_render_target_extent(&mut screen);

        assert_eq!(screen.width, 500);
        assert_eq!(screen.height, 400);
    }

    #[test]
    fn doubles_the_extent_of_a_supersampled_target() {
        let state = create_wgpu_render_state_for_test(None);
        let rig = create_screen_rig(&state, 320, 240, None);
        let mut screen = rig.screen.write().unwrap();
        enable_wgpu_screen_render_target_antialias(&mut screen);

        rig.canvas.set_size(100, 50);
        sync_wgpu_screen_render_target_extent(&mut screen);

        assert_eq!((screen.width, screen.height), (200, 100));
    }
}
