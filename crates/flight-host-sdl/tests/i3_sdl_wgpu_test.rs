use std::sync::{Arc, RwLock};

use flight_host_sdl::*;
use flight_render::RenderTargetClear;
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_bitmap_from_wgpu_screen_render_target,
    create_wgpu_acquisition, create_wgpu_render_state, create_wgpu_screen_render_target,
    destroy_wgpu_screen_render_target, enable_wgpu_screen_render_target_capture,
    end_wgpu_render_pass,
};

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn main() {
    if !display_available() {
        eprintln!("SKIP I3 SDL wgpu: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_sdl_host(&create_sdl_host_options(
        "Flight I3 SDL wgpu",
        320.0,
        240.0,
        true,
        SdlHostRenderBackend::Wgpu,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    let host_wgpu = get_sdl_host_wgpu_capability(&host)
        .expect("selected wgpu capability")
        .clone();
    let device = get_sdl_host_wgpu_device(&host)
        .expect("selected wgpu device")
        .clone();
    let surface = create_sdl_host_surface(&host);
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&host_wgpu, &surface, None))
            .expect("host acquisition");
    assert!(Arc::ptr_eq(&acquisition.device.handle, &device.handle));

    let mut render_state = create_wgpu_render_state(&device, None);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &host_wgpu, &device, &surface, None,
    )));
    let target = WgpuRenderTarget::Screen(screen.clone());
    let clear = RenderTargetClear {
        color: Some([0.08, 0.32, 0.72, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };

    for _ in 0..4 {
        assert_eq!(
            pump_sdl_host(&mut host).expect("pump"),
            SdlPumpStatus::Continue
        );
        end_wgpu_render_pass(begin_wgpu_render_pass(
            &mut render_state,
            &target,
            Some(&clear),
        ));
    }

    let display = get_sdl_host_surface_display_capability(&host)
        .expect("display capability")
        .clone();
    (display.set_display_size)(&surface, 200.0, 150.0);
    for _ in 0..20 {
        pump_sdl_host(&mut host).expect("real resize event pump");
        if (
            (acquisition.surface.width)(),
            (acquisition.surface.height)(),
        ) == (200.0, 150.0)
        {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert_eq!((acquisition.surface.width)(), 200.0);
    assert_eq!((acquisition.surface.height)(), 150.0);

    enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
    end_wgpu_render_pass(begin_wgpu_render_pass(
        &mut render_state,
        &target,
        Some(&clear),
    ));
    let bitmap = futures::executor::block_on(create_bitmap_from_wgpu_screen_render_target(
        &screen,
        Some(5_000),
    ))
    .expect("bounded screen capture");
    assert_eq!((bitmap.width, bitmap.height), (200, 150));
    assert!(bitmap.data.iter().any(|channel| *channel != 0));
    assert!(
        bitmap
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .any(|pixel| { pixel[0] > 10 && pixel[1] > 50 && pixel[2] > 120 && pixel[3] == 255 })
    );

    destroy_wgpu_screen_render_target(&mut screen.write().unwrap());
    drop(target);
    drop(screen);
    drop(render_state);
    drop(acquisition);
    destroy_sdl_host(host).expect("destroy on creator thread");
}
