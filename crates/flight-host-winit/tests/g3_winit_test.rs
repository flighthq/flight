use std::sync::{Arc, RwLock};

use flight_host_winit::{
    WinitHostOptions, WinitPumpStatus, create_winit_host, destroy_winit_host,
    get_winit_host_wgpu_capability, pump_winit_host,
};
use flight_render::RenderTargetClear;
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_acquisition, create_wgpu_render_state,
    create_wgpu_screen_render_target, end_wgpu_render_pass,
};
use flight_surface::{SurfaceBase, SurfaceRef, allocate_surface};

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

// winit requires event-loop creation on the process main thread on several platforms, so this
// target deliberately uses Cargo's custom-test-harness mode instead of the standard test harness.
fn main() {
    if !display_available() {
        eprintln!("SKIP G3: no DISPLAY or WAYLAND_DISPLAY; run under xvfb-run -a");
        return;
    }

    let mut host = create_winit_host(&WinitHostOptions {
        title: "Flight G3 smoke".to_string(),
        width: 320.0,
        height: 240.0,
        visible: true,
    })
    .unwrap_or_else(|failure| panic!("{failure}"));
    let window = flight_app::create_app_window();
    let host_wgpu = get_winit_host_wgpu_capability(&host).clone();
    let native = (host_wgpu.create)(&window, 320.0, 240.0).expect("winit surface");
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(native));
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&host_wgpu, &surface, None))
            .expect("host acquisition");
    let mut render_state = create_wgpu_render_state(&acquisition.device, None);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &host_wgpu,
        &acquisition.device,
        &surface,
        None,
    )));
    let target = WgpuRenderTarget::Screen(screen);
    let clear = RenderTargetClear {
        color: Some([0.08, 0.12, 0.2, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };

    for _ in 0..8 {
        assert_eq!(
            pump_winit_host(&mut host).expect("pump"),
            WinitPumpStatus::Continue
        );
        end_wgpu_render_pass(begin_wgpu_render_pass(
            &mut render_state,
            &target,
            Some(&clear),
        ));
    }

    destroy_winit_host(host).expect("destroy on creator thread");
}
