//! Minimal SDL2 host demo.
//!
//! Opens a window and runs the Flight wgpu frame protocol, registering the
//! standard display-object renderer and clearing to a background color each
//! frame. The `setup` and `update` closures here are exactly what a winit host
//! would receive, which is the point of the backend seam: swap `run_sdl_app`
//! for `run_winit_app` and this same scene runs unchanged.
//!
//! Run with:
//!   CMAKE_POLICY_VERSION_MINIMUM=3.5 CFLAGS="-std=gnu17" \
//!     cargo run -p flighthq-host-sdl --example demo
//!
//! (the CMake/CFLAGS env vars are only needed where the bundled SDL2 source must
//! be compiled by a very new toolchain; on a normal machine `cargo run` suffices.)

use flighthq_host_sdl::{SdlAppOptions, SdlFrame, run_sdl_app};
use flighthq_render_wgpu::{WgpuRenderOptions, register_wgpu_display_object_renderer};

fn main() {
    let options = SdlAppOptions {
        title: "Flight SDL2 demo".to_string(),
        width: 960,
        height: 540,
        resizable: true,
        render_options: WgpuRenderOptions {
            background_color: Some(0x102030ff),
            ..Default::default()
        },
    };

    // Any value works for a background-only scene; a real scene passes its stage
    // render-proxy id and builds the proxy graph in `setup`.
    let stage_source_id: u64 = 0;

    let result = run_sdl_app(
        &options,
        stage_source_id,
        |render_state, _stage_id| {
            // One-time scene setup: register the renderers this scene needs.
            register_wgpu_display_object_renderer(render_state);
        },
        |_frame: SdlFrame<'_>| {
            // Per-frame update would mutate the scene / read input here.
        },
    );

    if let Err(message) = result {
        eprintln!("flight sdl host failed: {message}");
        std::process::exit(1);
    }
}
