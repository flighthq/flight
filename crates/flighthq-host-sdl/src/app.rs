//! `run_sdl_app` — the SDL3 host run entry.
//!
//! Opens an SDL window, creates a wgpu surface + `WgpuRenderState` from it, runs
//! the caller's one-time scene setup (renderer registration + scene build), then
//! drives the event loop: each iteration pumps SDL events into `flighthq-input`,
//! calls the caller's per-frame `update`, and renders one frame via the
//! `render-wgpu` frame protocol.
//!
//! The `setup` / `update` closures are the portable seam: the same closures run
//! unchanged under a winit host (`run_winit_app`) or this SDL host, which is the
//! point of the backend seam — only the window/event-loop/surface wiring differs.

use flighthq_input::{InputManager, create_input_manager, dispose_input_manager};
use flighthq_render_wgpu::WgpuRenderOptions;

use crate::event::dispatch_sdl_event;
use crate::render_frame::{
    SdlRenderContext, create_sdl_render_context, render_sdl_frame, resize_sdl_render_context,
};

/// Options for `run_sdl_app`.
#[derive(Clone, Debug)]
pub struct SdlAppOptions {
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub resizable: bool,
    pub render_options: WgpuRenderOptions,
}

impl Default for SdlAppOptions {
    fn default() -> Self {
        Self {
            title: "Flight (SDL3)".to_string(),
            width: 960,
            height: 540,
            resizable: true,
            render_options: WgpuRenderOptions::default(),
        }
    }
}

/// Per-frame context handed to the caller's `update` closure each iteration.
///
/// Carries the render state (for scene mutation), the input manager (already fed
/// this frame's events), and the elapsed time since the previous frame.
pub struct SdlFrame<'a> {
    pub render_context: &'a mut SdlRenderContext,
    pub input: &'a mut InputManager,
    pub delta_seconds: f32,
}

/// Runs the SDL3 host to completion: creates the window and wgpu surface, calls
/// `setup` once with the render state and the stage source id, then loops until
/// the window is closed, rendering the stage each frame.
///
/// * `setup(render_state, stage_source_id)` registers renderers
///   (`register_wgpu_display_object_renderer`, …) and builds the scene. Mirrors
///   `flighthq-capture`'s `scene_setup` so the same builder works headless or
///   windowed.
/// * `update(frame)` runs once per frame before rendering, after this frame's
///   SDL events have been dispatched into the input manager.
///
/// `stage_source_id` is the render-proxy id rendered each frame via
/// `render_wgpu_display_object`.
///
/// Returns `Ok(())` on a clean window close, or `Err` with a message for an
/// unrecoverable setup failure (window/video init, or no GPU adapter). Expected
/// per-frame failures (a transiently unavailable surface texture) are handled by
/// reconfiguring, not by returning an error.
pub fn run_sdl_app<S, U>(
    options: &SdlAppOptions,
    stage_source_id: u64,
    setup: S,
    mut update: U,
) -> Result<(), String>
where
    S: FnOnce(&mut flighthq_render_wgpu::WgpuRenderState, u64),
    U: FnMut(SdlFrame<'_>),
{
    let sdl_context = sdl3::init().map_err(|e| e.to_string())?;
    let video = sdl_context.video().map_err(|e| e.to_string())?;

    let mut window_builder =
        video.window(&options.title, options.width.max(1), options.height.max(1));
    window_builder.position_centered();
    if options.resizable {
        window_builder.resizable();
    }
    let window = window_builder.build().map_err(|e| e.to_string())?;

    let (drawable_width, drawable_height) = window.size_in_pixels();
    let mut render_context = create_sdl_render_context(
        window,
        drawable_width,
        drawable_height,
        &options.render_options,
    )
    .ok_or_else(|| "no compatible wgpu adapter available".to_string())?;

    setup(&mut render_context.render_state, stage_source_id);

    let mut input = create_input_manager();
    let mut event_pump = sdl_context.event_pump().map_err(|e| e.to_string())?;
    // SDL3 exposes the millisecond tick counter as a free function returning
    // `u64` (SDL2 read it off a `TimerSubsystem` as `u32`).
    let mut last_ticks = sdl3::timer::ticks();

    'running: loop {
        for event in event_pump.poll_iter() {
            use sdl3::event::{Event, WindowEvent};
            match &event {
                Event::Quit { .. } => break 'running,
                // SDL3 splits SDL2's `SizeChanged` into `Resized` (logical/window
                // units) and `PixelSizeChanged` (drawable/backing-store pixels).
                // The wgpu surface is sized in pixels, so the pixel-size event is
                // the one that drives reconfiguration.
                Event::Window {
                    win_event: WindowEvent::PixelSizeChanged(w, h),
                    ..
                } => {
                    resize_sdl_render_context(&mut render_context, *w as u32, *h as u32);
                }
                _ => {
                    dispatch_sdl_event(&mut input, &event);
                }
            }
        }

        let now = sdl3::timer::ticks();
        let delta_seconds = (now.wrapping_sub(last_ticks)) as f32 / 1000.0;
        last_ticks = now;

        update(SdlFrame {
            render_context: &mut render_context,
            input: &mut input,
            delta_seconds,
        });

        // This host does not wire the scene-graph walk (see render_sdl_frame's
        // NOTE: the scene is not yet drawn to the surface in the Rust port), so
        // the draw step is a no-op; the background clear is what presents.
        let _ = stage_source_id;
        if !render_sdl_frame(&mut render_context, &mut |_state| {}) {
            // Surface lost or outdated; reconfigure at the current drawable size and retry next frame.
            let (w, h) = render_context.window.size_in_pixels();
            resize_sdl_render_context(&mut render_context, w, h);
        }
    }

    dispose_input_manager(&mut input);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sdl_app_options_default_is_sensible() {
        let options = SdlAppOptions::default();
        assert!(options.width > 0);
        assert!(options.height > 0);
        assert!(options.resizable);
    }
}
