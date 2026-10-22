use flight_entity::Ref;
use flight_render_wgpu::*;

use crate::support::*;

fn transparent_clear() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        ..test_default()
    };
}

// A screen target that has drawn one captured frame, so its capture texture exists.
fn capture_ready_screen_render_target(state: &mut WgpuRenderState) -> Ref<WgpuScreenRenderTarget> {
    let screen = create_wgpu_screen_render_target_for_test(state, None, false, 800, 600);
    enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
    end_wgpu_render_pass(begin_wgpu_render_pass(
        state,
        &WgpuRenderTarget::Screen(screen.clone()),
        Some(&transparent_clear()),
    ));
    return screen;
}

// A MAP_READ capture buffer on `native`'s device whose contents are `bytes` (zero-padded to `size`),
// unmapped and ready for a readback to map.
fn create_filled_capture_buffer(
    native: &WgpuNativeDevice,
    size: u64,
    bytes: &[u8],
) -> wgpu::Buffer {
    let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: true,
    });
    let mut contents = bytes.to_vec();
    contents.resize(size as usize, 0);
    buffer
        .slice(..)
        .get_mapped_range_mut()
        .expect("the buffer is mapped at creation")
        .copy_from_slice(&contents);
    buffer.unmap();
    return buffer;
}

// Installs a retained capture buffer of `width`x`height` with 256-byte rows (the source's
// `installCaptureBuffer`); the buffer's device decides whether the target's poll can map it.
fn install_capture_buffer(
    target: &Ref<WgpuScreenRenderTarget>,
    buffer: wgpu::Buffer,
    width: u32,
    height: u32,
) {
    let mut target = target.write().unwrap();
    target.capture_buffer = Some(buffer);
    target.capture_width = width;
    target.capture_height = height;
    target.capture_bytes_per_row = 256;
}

// A buffer on a second, live device: the target's poll never settles its map, which is the driver
// failure the bound exists for (a map that neither resolves nor rejects). The caller keeps the
// returned device alive; a buffer whose queue is gone maps immediately.
fn create_never_mapping_buffer() -> (wgpu::Buffer, WgpuNativeDevice) {
    let other = create_test_native_device();
    return (create_filled_capture_buffer(&other, 256, &[]), other);
}

fn submit_encoder_cleanly(native: &WgpuNativeDevice, encoder: wgpu::CommandEncoder) {
    let error = capture_test_validation_error(native, || {
        native.queue.submit([encoder.finish()]);
    });
    assert!(error.is_none(), "{error:?}");
}

mod create_bitmap_from_wgpu_screen_render_target {
    use super::*;

    #[test]
    fn throws_when_capture_was_never_enabled_no_buffer_to_read() {
        let state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        let error = block_on(create_bitmap_from_wgpu_screen_render_target(&screen, None))
            .expect_err("a rejection");
        assert!(
            error
                .message
                .contains("enableWgpuScreenRenderTargetCapture")
        );
    }

    #[test]
    fn reads_the_mapped_buffer_within_the_bound() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        install_capture_buffer(
            &screen,
            create_filled_capture_buffer(&native, 256, &[10, 20, 30, 40]),
            1,
            1,
        );

        let bitmap = block_on(create_bitmap_from_wgpu_screen_render_target(
            &screen,
            Some(1_000),
        ))
        .unwrap();

        assert_eq!(bitmap.width, 1);
        assert_eq!(bitmap.height, 1);
    }

    #[test]
    fn swizzles_a_bgra_frame_to_rgba_and_skips_row_padding() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        assert_eq!(
            screen.read().unwrap().format,
            wgpu::TextureFormat::Bgra8Unorm
        );
        let mut bytes = vec![0u8; 512];
        bytes[0..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
        bytes[256..264].copy_from_slice(&[9, 10, 11, 12, 13, 14, 15, 16]);
        install_capture_buffer(
            &screen,
            create_filled_capture_buffer(&native, 512, &bytes),
            2,
            2,
        );

        let bitmap = block_on(create_bitmap_from_wgpu_screen_render_target(&screen, None)).unwrap();

        assert_eq!(
            bitmap.data.to_vec(),
            vec![3, 2, 1, 4, 7, 6, 5, 8, 11, 10, 9, 12, 15, 14, 13, 16]
        );
    }

    #[test]
    fn keeps_rgba_byte_order_for_an_rgba_frame() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = create_wgpu_screen_render_target_for_test(
            &state,
            Some(WgpuScreenRenderTargetOptions {
                format: Some(wgpu::TextureFormat::Rgba8Unorm),
                ..test_default()
            }),
            false,
            800,
            600,
        );
        install_capture_buffer(
            &screen,
            create_filled_capture_buffer(&native, 256, &[10, 20, 30, 40]),
            1,
            1,
        );

        let bitmap = block_on(create_bitmap_from_wgpu_screen_render_target(&screen, None)).unwrap();

        assert_eq!(bitmap.data.to_vec(), vec![10, 20, 30, 40]);
    }

    #[test]
    fn fails_by_name_when_the_buffer_never_maps_instead_of_awaiting_forever() {
        // The driver failure this bounds: the map neither resolves nor rejects. Before the bound,
        // the caller sat here until something outside it gave up and reported a stall with no
        // location.
        let state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        let (never_mapping, _other_device) = create_never_mapping_buffer();
        install_capture_buffer(&screen, never_mapping, 1, 1);

        let error = block_on(create_bitmap_from_wgpu_screen_render_target(
            &screen,
            Some(25),
        ))
        .expect_err("a rejection");
        assert!(error.message.contains("did not map within 25ms"));
    }

    // The source settles a fake map promise after a delay; Rust's readback blocks in the device
    // poll, so an unbounded (0) wait is observed as a map that waits behind the submitted frame's
    // copy and then reads the real retained buffer.
    #[test]
    fn leaves_the_wait_unbounded_when_the_caller_passes_0() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = capture_ready_screen_render_target(&mut state);
        assert!(screen.read().unwrap().capture_buffer.is_some());

        let bitmap = block_on(create_bitmap_from_wgpu_screen_render_target(
            &screen,
            Some(0),
        ))
        .unwrap();

        assert_eq!(bitmap.width, 800);
        assert_eq!(bitmap.height, 600);
        assert_eq!(bitmap.data.len(), 800 * 600 * 4);
    }
}

mod enable_wgpu_screen_render_target_capture {
    use super::*;

    #[test]
    fn sets_the_capture_flag_on_the_screen_target() {
        let state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        let mut screen = screen.write().unwrap();
        assert!(!screen.capture_enabled);
        enable_wgpu_screen_render_target_capture(&mut screen);
        assert!(screen.capture_enabled);
        assert!(screen.acquire_capture_texture.is_some());
        assert!(screen.encode_capture.is_some());
    }

    #[test]
    fn redirects_the_frame_into_an_offscreen_texture_rather_than_the_swap_chain() {
        // The whole reason capture exists: software and headless adapters never present the swap
        // chain, and its texture reads back as zeros, so a captured frame must be drawn somewhere
        // readable instead.
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        assert!(screen.read().unwrap().capture_texture.is_none());

        enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
        end_wgpu_render_pass(begin_wgpu_render_pass(
            &mut state,
            &WgpuRenderTarget::Screen(screen.clone()),
            Some(&transparent_clear()),
        ));

        let screen = screen.read().unwrap();
        let texture = screen.capture_texture.as_ref().expect("a capture texture");
        assert_eq!((texture.width(), texture.height()), (800, 600));
        assert!(texture.usage().contains(wgpu::TextureUsages::COPY_SRC));
        // The frame's own submit copied it into the retained buffer, rows padded to 256 bytes.
        assert!(screen.capture_buffer.is_some());
        assert_eq!(screen.capture_bytes_per_row, 3328);
        assert_eq!((screen.capture_width, screen.capture_height), (800, 600));
    }
}

mod encode_wgpu_screen_render_target_capture {
    use super::*;

    // The source counts calls on a fake encoder; here the copy is observed through the retained
    // buffer it allocates and sizes, and the encoder is submitted to check it validates.
    #[test]
    fn is_a_no_op_when_capture_is_disabled() {
        let state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 4, 4);
        let mut screen = screen.write().unwrap();
        screen.capture_texture = Some(native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 4,
                height: 4,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: screen.format,
            usage: wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        }));
        let mut encoder = native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });

        encode_wgpu_screen_render_target_capture(&mut screen, &mut encoder);

        assert!(screen.capture_buffer.is_none());
        submit_encoder_cleanly(&native, encoder);
    }

    // The source flips a fake buffer's `mapState`; Rust's reader holds the turn from its map request
    // until the map settles, so a readback whose map never settled (timed out) keeps the writer off
    // the buffer, and a readback that completes hands it back.
    #[test]
    fn skips_the_copy_while_a_readback_holds_the_buffer_and_resumes_once_it_lets_go() {
        // The writer/reader handshake over the single retained buffer: an animating scene must not
        // keep enqueueing copies into a buffer a readback has mapped or is waiting to map.
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = capture_ready_screen_render_target(&mut state);
        let (held, _other_device) = create_never_mapping_buffer();
        install_capture_buffer(&screen, held.clone(), 1, 1);
        assert!(
            block_on(create_bitmap_from_wgpu_screen_render_target(
                &screen,
                Some(25)
            ))
            .is_err()
        );

        let mut encoder = native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        encode_wgpu_screen_render_target_capture(&mut screen.write().unwrap(), &mut encoder);
        encode_wgpu_screen_render_target_capture(&mut screen.write().unwrap(), &mut encoder);
        {
            let current = screen.read().unwrap();
            assert_eq!(current.capture_buffer.as_ref(), Some(&held));
            assert_eq!((current.capture_width, current.capture_height), (1, 1));
        }
        submit_encoder_cleanly(&native, encoder);

        install_capture_buffer(
            &screen,
            create_filled_capture_buffer(&native, 256, &[]),
            1,
            1,
        );
        block_on(create_bitmap_from_wgpu_screen_render_target(&screen, None)).unwrap();
        let mut encoder = native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        encode_wgpu_screen_render_target_capture(&mut screen.write().unwrap(), &mut encoder);
        {
            let current = screen.read().unwrap();
            assert_ne!(current.capture_buffer.as_ref(), Some(&held));
            assert_eq!((current.capture_width, current.capture_height), (800, 600));
        }
        submit_encoder_cleanly(&native, encoder);
    }

    // The source's undefined `mapState` case: a buffer no readback ever touched must read as free,
    // so the copy runs (observed as the retained buffer being resized to the frame).
    #[test]
    fn still_copies_when_the_implementation_reports_no_map_state_at_all() {
        // Fails safe in the direction that keeps capturing: a buffer with no map history must not
        // read as "busy" and silence every copy for the rest of the run.
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = capture_ready_screen_render_target(&mut state);
        install_capture_buffer(
            &screen,
            create_filled_capture_buffer(&native, 256, &[]),
            1,
            1,
        );

        let mut encoder = native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        encode_wgpu_screen_render_target_capture(&mut screen.write().unwrap(), &mut encoder);

        let current = screen.read().unwrap();
        assert_eq!((current.capture_width, current.capture_height), (800, 600));
        assert_eq!(current.capture_bytes_per_row, 3328);
        assert_eq!(
            current.capture_buffer.as_ref().map(|buffer| buffer.size()),
            Some(3328 * 600)
        );
        drop(current);
        submit_encoder_cleanly(&native, encoder);
    }
}
