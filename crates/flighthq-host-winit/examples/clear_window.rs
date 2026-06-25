//! Minimal flighthq-host-winit demo: opens a window, brings up wgpu, runs the
//! render frame protocol every frame, and logs translated input events.
//!
//! Run it on a machine with a display and GPU:
//!
//! ```bash
//! cargo run --example clear_window -p flighthq-host-winit
//! ```
//!
//! What this proves end-to-end: window + event loop, wgpu instance/adapter/
//! device/surface bring-up, opt-in renderer registration, the per-frame protocol
//! (background clear -> display-object draw -> submit -> blit-to-surface ->
//! present), surface resize, and winit -> flighthq-input translation.
//!
//! Note: the window animates its clear color so the present path is visibly live.
//! Drawing an actual display-object subtree additionally needs the scene-graph ->
//! render-proxy prepare bridge (`flighthq_render::prepare_display_object_render`
//! wired to the display-object arena), which is a cross-package piece not owned by
//! the host. This demo therefore renders a clear scene and reports input.

use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flighthq_displayobject::{DisplayObjectArena, create_stage};
use flighthq_host_winit::{InputManager, WgpuRenderState, WinitAppConfig, run_winit_app};
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_types::input::{InputKeyboardData, InputPointerData};

fn main() {
    let mut arena = DisplayObjectArena::default();
    let _stage = create_stage(&mut arena);

    // Animate the background color so the present pipeline is visibly running.
    let frame = Arc::new(AtomicU32::new(0));

    let mut config = WinitAppConfig {
        title: "Flight winit host — clear_window".to_string(),
        width: 960,
        height: 540,
        ..Default::default()
    };
    config.render_options.background_color = Some(0x10_20_30_ff);

    let mut scene_setup = move |state: &mut WgpuRenderState, input: &mut InputManager| -> u64 {
        // Log a few translated input events to prove the input seam is wired.
        let _g1 = connect_signal(
            &input.signals.on_pointer_down,
            Arc::new(|d: &InputPointerData| {
                println!(
                    "pointer down at ({:.0}, {:.0}) buttons={}",
                    d.x, d.y, d.buttons
                );
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &input.signals.on_key_down,
            Arc::new(|d: &InputKeyboardData| {
                println!("key down: code={:?} key_code={}", d.code, d.key_code);
            }),
            SignalConnectOptions::default(),
        );
        // Leak the guards for the lifetime of the app so the listeners stay live.
        std::mem::forget(_g1);
        std::mem::forget(_g2);

        let _ = state;
        // The stage carries no render proxies without the prepare bridge; the
        // render walk over this id is a no-op draw, leaving the cleared frame.
        0
    };

    let frame_counter = Arc::clone(&frame);
    let mut frame_update =
        move |_dt: f32, state: &mut WgpuRenderState, _input: &mut InputManager| {
            // Pulse the clear color each frame so the window visibly updates.
            let n = frame_counter.fetch_add(1, Ordering::Relaxed);
            let phase = n % 256;
            state.render_state.background_color = 0x10_20_00_ff | (phase << 8);
        };

    run_winit_app(config, &mut scene_setup, &mut frame_update);
}
