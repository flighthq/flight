//! `flighthq-capture` — headless wgpu scene capture.
//!
//! Renders a Flight scene to an **offscreen** texture (no window, no swapchain)
//! and reads it back to CPU pixels, so renders can be screenshotted and diffed
//! in CI without a display. This is the long-term GPU regression gate: the same
//! `flighthq-render-wgpu` frame protocol a windowed host runs, driven against an
//! offscreen color target and a retained `MAP_READ` readback buffer.
//!
//! # Adapter
//!
//! Capture requests a `wgpu::Adapter` over all backends and, when no hardware
//! GPU is present, accepts a fallback/software adapter (llvmpipe / lavapipe /
//! WARP). When no adapter exists at all (`request_wgpu_capture_device` returns
//! `None`), the capture functions return a sentinel (`false` / `None`) rather
//! than panicking — a headless box with no software rasterizer simply produces
//! no capture.
//!
//! # Frame protocol
//!
//! Each capture mirrors the windowed flow in the host docs, with frame capture
//! enabled so the renderer redirects the frame into its offscreen `COPY_SRC`
//! texture and copies it into the readback buffer in the same submission:
//!
//! 1. `enable_wgpu_frame_capture(state)`
//! 2. `scene_setup(state, stage_source_id)` — caller registers renderers and
//!    builds the scene (background color, proxy graph). It returns a draw step
//!    (an `FnOnce(&mut WgpuRenderState)`) that runs after the background pass is
//!    open, where the caller issues `prepare_display_object_render` (if not done
//!    in setup) and `render_wgpu_display_object` to walk and draw the scene.
//! 3. `render_wgpu_background(state)`
//! 4. the returned draw step runs inside the open pass.
//! 5. `submit_wgpu_render_pass(state)` — encodes the texture→buffer copy.
//! 6. map the readback buffer, drop wgpu's 256-byte row padding, return RGBA.
//!
//! # Design
//!
//! These are free functions with explicit ownership. `scene_setup` receives the
//! `&mut WgpuRenderState` and the stage source id it should render; the capture
//! function owns the device/queue/adapter lifetime and frees them on return.

use flighthq_render_wgpu::{
    WgpuRenderOptions, WgpuRenderState, create_wgpu_render_state, destroy_wgpu_render_state,
    enable_wgpu_frame_capture, get_wgpu_render_state_runtime, render_wgpu_background,
    submit_wgpu_render_pass,
};

// wgpu requires the per-row copy stride to be a multiple of 256 bytes; the
// readback buffer the renderer allocates is padded to this, so the unpack must
// drop the trailing bytes of each row.
const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;

/// Color format the offscreen capture target uses. Non-sRGB `Rgba8Unorm`, so
/// Flight's packed sRGB colors pass through 1:1 (0x80 captures back as 0x80) —
/// matching the TS renderers' RGBA8 convention and keeping captures comparable
/// to TS functional baselines. The readback is plain RGBA bytes.
pub const CAPTURE_TEXTURE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The post-background draw step returned by a `WgpuCaptureSceneSetup`. It runs
/// after `render_wgpu_background` opens the frame pass, so it is where the caller
/// issues `render_wgpu_display_object` (the scene walk needs an open pass).
pub type WgpuCaptureDrawStep<'a> = Box<dyn FnOnce(&mut WgpuRenderState) + 'a>;

/// Post-submit teardown returned by a `WgpuCaptureDrawStepWithTeardown`. It runs
/// after `submit_wgpu_render_pass` so a draw step that retains GPU resources
/// across the submit (an effect pipeline's scene/scratch targets, referenced by
/// the command encoder until the queue submission completes) frees them only
/// once the submission no longer references them. Return a no-op when the draw
/// step owns nothing past the frame.
pub type WgpuCaptureTeardown<'a> = Box<dyn FnOnce(&mut WgpuRenderState) + 'a>;

/// The post-background draw step for [`capture_scene_with_teardown_to_rgba`]: it
/// draws the frame (like [`WgpuCaptureDrawStep`]) and returns a teardown that the
/// capture runs after the submit. Use this when the frame retains GPU resources
/// the submit references — for example the render-effect pipeline, whose scene
/// and scratch targets must outlive the submitted command buffer.
pub type WgpuCaptureDrawStepWithTeardown<'a> =
    Box<dyn FnOnce(&mut WgpuRenderState) -> WgpuCaptureTeardown<'a> + 'a>;

/// Caller-supplied scene builder for [`capture_scene_with_teardown_to_rgba`].
/// Like [`WgpuCaptureSceneSetup`] but its draw step returns a post-submit
/// teardown.
pub type WgpuCaptureSceneSetupWithTeardown<'a> =
    dyn FnOnce(&mut WgpuRenderState, u64) -> WgpuCaptureDrawStepWithTeardown<'a> + 'a;

/// Caller-supplied scene builder. Receives the freshly created render state and
/// the stage source id the frame will render. Implementations register the
/// renderers they need (`register_wgpu_display_object_renderer`, …), set the
/// background color, build whatever proxy graph the scene requires (running
/// `prepare_display_object_render`), and return a draw step that issues the
/// scene walk once the background pass is open. Return a no-op draw step for a
/// pure background-clear capture. The capture function runs the frame protocol
/// around this call.
pub type WgpuCaptureSceneSetup<'a> =
    dyn FnOnce(&mut WgpuRenderState, u64) -> WgpuCaptureDrawStep<'a> + 'a;

/// Renders a scene to an offscreen texture and writes it to `out_path` as a PNG.
///
/// Returns `true` on success, `false` for every expected failure: no adapter
/// available in this environment, a zero dimension, a readback map failure, or
/// a PNG encode/write error. Does not panic on missing GPU.
///
/// `stage_source_id` is passed through to `scene_setup` and is the id the caller
/// renders with `render_wgpu_display_object`. For a pure background-clear
/// capture it may be any value (e.g. `0`).
pub fn capture_scene_to_png(
    width: u32,
    height: u32,
    background_color: u32,
    stage_source_id: u64,
    scene_setup: Box<WgpuCaptureSceneSetup<'_>>,
    out_path: &std::path::Path,
) -> bool {
    let Some(pixels) = capture_scene_to_rgba(
        width,
        height,
        background_color,
        stage_source_id,
        scene_setup,
    ) else {
        return false;
    };
    let Some(image_buffer) = image::RgbaImage::from_raw(width, height, pixels) else {
        return false;
    };
    image_buffer
        .save_with_format(out_path, image::ImageFormat::Png)
        .is_ok()
}

/// Lower-level capture: renders a scene to an offscreen texture and returns the
/// tightly packed RGBA bytes (`width * height * 4`, top-left origin, no row
/// padding), or `None` for any expected failure (no adapter, zero dimension,
/// readback map failure).
pub fn capture_scene_to_rgba(
    width: u32,
    height: u32,
    background_color: u32,
    stage_source_id: u64,
    scene_setup: Box<WgpuCaptureSceneSetup<'_>>,
) -> Option<Vec<u8>> {
    // A plain draw step owns nothing past the frame, so its teardown is a no-op.
    capture_scene_with_teardown_to_rgba(
        width,
        height,
        background_color,
        stage_source_id,
        Box::new(move |state, stage_id| {
            let draw_step = scene_setup(state, stage_id);
            Box::new(move |state: &mut WgpuRenderState| {
                draw_step(state);
                Box::new(|_: &mut WgpuRenderState| {})
            })
        }),
    )
}

/// Like [`capture_scene_to_rgba`], but the scene's draw step returns a
/// post-submit teardown the capture runs after `submit_wgpu_render_pass`.
///
/// Use this when the frame retains GPU resources the submitted command buffer
/// references — for example the render-effect pipeline, whose scene and scratch
/// targets must survive until the submission completes. Destroying them inside
/// the draw step (before submit) invalidates textures the encoded copy/present
/// still reads; the teardown defers that to after the submit.
pub fn capture_scene_with_teardown_to_rgba(
    width: u32,
    height: u32,
    background_color: u32,
    stage_source_id: u64,
    scene_setup: Box<WgpuCaptureSceneSetupWithTeardown<'_>>,
) -> Option<Vec<u8>> {
    if width == 0 || height == 0 {
        return None;
    }

    let (device, queue) = request_wgpu_capture_device()?;

    let options = WgpuRenderOptions {
        format: Some(CAPTURE_TEXTURE_FORMAT),
        background_color: Some(background_color),
        ..Default::default()
    };
    let mut state = create_wgpu_render_state(
        device,
        queue,
        CAPTURE_TEXTURE_FORMAT,
        width,
        height,
        &options,
    );

    // Redirect the frame into the renderer's offscreen COPY_SRC texture + readback buffer.
    enable_wgpu_frame_capture(&mut state);

    // Caller builds the scene (renderer registration, background, proxy graph) and returns the
    // draw step that issues render_wgpu_display_object once the background pass is open.
    let draw_step = scene_setup(&mut state, stage_source_id);

    // Frame protocol: background clear opens the frame, the draw step walks/draws the scene into
    // the open pass, then submit encodes the texture→buffer copy that read_wgpu_capture_buffer
    // maps back. The teardown the draw step returns runs after submit so retained GPU resources
    // are freed only once the submitted command buffer no longer references them.
    render_wgpu_background(&mut state);
    let teardown = draw_step(&mut state);
    submit_wgpu_render_pass(&mut state);
    teardown(&mut state);

    let pixels = read_wgpu_capture_buffer(&state, width, height);

    destroy_wgpu_render_state(&mut state);
    pixels
}

/// Requests a `wgpu::Device` / `wgpu::Queue` suitable for headless capture.
///
/// Tries a normal adapter first (over all backends), then falls back to a
/// software adapter (`force_fallback_adapter`). Returns `None` when neither is
/// available, so callers degrade to a sentinel instead of panicking on boxes
/// with no GPU and no software rasterizer.
pub fn request_wgpu_capture_device() -> Option<(wgpu::Device, wgpu::Queue)> {
    pollster::block_on(request_wgpu_capture_device_async())
}

async fn request_wgpu_capture_device_async() -> Option<(wgpu::Device, wgpu::Queue)> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = match instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::None,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await
    {
        Some(adapter) => Some(adapter),
        None => {
            instance
                .request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::None,
                    force_fallback_adapter: true,
                    compatible_surface: None,
                })
                .await
        }
    }?;

    request_wgpu_capture_device_from_adapter(&adapter).await
}

async fn request_wgpu_capture_device_from_adapter(
    adapter: &wgpu::Adapter,
) -> Option<(wgpu::Device, wgpu::Queue)> {
    adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("flight-capture-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::default(),
            },
            None,
        )
        .await
        .ok()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Maps the renderer's retained capture buffer and copies it into a tightly packed
// RGBA Vec, dropping wgpu's 256-byte per-row padding. Returns None if capture was
// never enabled (no buffer) or the map fails.
fn read_wgpu_capture_buffer(state: &WgpuRenderState, width: u32, height: u32) -> Option<Vec<u8>> {
    let runtime = get_wgpu_render_state_runtime(state);
    let buffer = runtime.frame_capture_buffer.as_ref()?;

    let padded_bytes_per_row = aligned_bytes_per_row(width, 4) as usize;
    let unpadded_bytes_per_row = (width * 4) as usize;

    let slice = buffer.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    // Drive the device until the map callback fires.
    state.device.poll(wgpu::Maintain::Wait);
    if receiver.recv().ok()?.is_err() {
        return None;
    }

    let mapped = slice.get_mapped_range();
    let mut pixels = Vec::with_capacity(unpadded_bytes_per_row * height as usize);
    for row in 0..height as usize {
        let start = row * padded_bytes_per_row;
        pixels.extend_from_slice(&mapped[start..start + unpadded_bytes_per_row]);
    }
    drop(mapped);
    buffer.unmap();

    Some(pixels)
}

// Rounds the per-row byte count up to wgpu's 256-byte copy alignment. Mirrors the
// renderer's own padding so unpack drops exactly the bytes the copy added.
fn aligned_bytes_per_row(width: u32, bytes_per_pixel: u32) -> u32 {
    let unaligned = width * bytes_per_pixel;
    let rem = unaligned % COPY_BYTES_PER_ROW_ALIGNMENT;
    if rem == 0 {
        unaligned
    } else {
        unaligned + (COPY_BYTES_PER_ROW_ALIGNMENT - rem)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligned_bytes_per_row_handles_small_widths() {
        assert_eq!(aligned_bytes_per_row(1, 4), 256);
    }

    #[test]
    fn aligned_bytes_per_row_keeps_exact_multiples() {
        assert_eq!(aligned_bytes_per_row(64, 4), 256);
        assert_eq!(aligned_bytes_per_row(128, 4), 512);
    }

    #[test]
    fn aligned_bytes_per_row_rounds_up_to_256() {
        assert_eq!(aligned_bytes_per_row(100, 4), 512);
    }

    #[test]
    fn capture_scene_to_rgba_rejects_zero_dimensions() {
        assert!(
            capture_scene_to_rgba(0, 16, 0xff0000ff, 0, Box::new(|_, _| Box::new(|_| {})))
                .is_none()
        );
        assert!(
            capture_scene_to_rgba(16, 0, 0xff0000ff, 0, Box::new(|_, _| Box::new(|_| {})))
                .is_none()
        );
    }

    #[test]
    fn capture_scene_with_teardown_to_rgba_rejects_zero_dimensions() {
        // Zero dimensions short-circuit before any adapter request, so this is
        // GPU-independent. The draw step returns a no-op teardown.
        let setup = || -> Box<WgpuCaptureSceneSetupWithTeardown> {
            Box::new(|_, _| Box::new(|_| Box::new(|_| {})))
        };
        assert!(capture_scene_with_teardown_to_rgba(0, 16, 0xff0000ff, 0, setup()).is_none());
        assert!(capture_scene_with_teardown_to_rgba(16, 0, 0xff0000ff, 0, setup()).is_none());
    }
}
