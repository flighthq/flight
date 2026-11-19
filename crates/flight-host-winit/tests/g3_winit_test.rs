use std::sync::{Arc, RwLock};

use flight_host_winit::{
    WinitPumpStatus, create_winit_host, create_winit_host_options, create_winit_host_surface,
    destroy_winit_host, get_winit_host_wgpu_capability, get_winit_host_wgpu_device,
    pump_winit_host,
};
use flight_render::RenderTargetClear;
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_acquisition, create_wgpu_render_state,
    create_wgpu_screen_render_target, end_wgpu_render_pass,
};

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

    let mut host = create_winit_host(&create_winit_host_options(
        "Flight G3 smoke",
        320.0,
        240.0,
        true,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    let host_wgpu = get_winit_host_wgpu_capability(&host).clone();
    let surface = create_winit_host_surface(&host);
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&host_wgpu, &surface, None))
            .expect("host acquisition");
    assert!(Arc::ptr_eq(
        &acquisition.device.handle,
        &get_winit_host_wgpu_device(&host).handle
    ));
    let mut render_state = create_wgpu_render_state(get_winit_host_wgpu_device(&host), None);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &host_wgpu,
        get_winit_host_wgpu_device(&host),
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
