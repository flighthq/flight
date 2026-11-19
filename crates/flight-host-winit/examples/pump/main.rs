mod scene;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use flight_host_winit::*;
use flight_input::{
    attach_keyboard_input, attach_pointer_input, create_input_manager, detach_keyboard_input,
    detach_pointer_input,
};
use flight_render::{RenderProxies2D, destroy_render_state};
use flight_render_wgpu::{
    WgpuRenderTarget, create_wgpu_acquisition, create_wgpu_render_state,
    create_wgpu_screen_render_target, register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d_wgpu::register_wgpu_scene2d_render_preset;
use flight_signals::connect_signal;
use flight_surface::{SurfaceBase, SurfaceRef, allocate_surface};
use scene::{create_pump_scene, move_pump_scene_shape, render_pump_scene_frame};

fn main() {
    let frame_limit = std::env::var("FLIGHT_WINIT_EXAMPLE_FRAMES")
        .ok()
        .and_then(|value| value.parse::<u64>().ok());
    let mut host = create_winit_host(&WinitHostOptions {
        title: "Flight winit pump".to_string(),
        width: 800.0,
        height: 600.0,
        visible: true,
    })
    .unwrap_or_else(|failure| panic!("{}", explain_winit_host_failure(&failure)));

    let app_window = flight_app::create_app_window();
    let wgpu_host = get_winit_host_wgpu_capability(&host).clone();
    let native = (wgpu_host.create)(&app_window, 800.0, 600.0).expect("winit drawable");
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(native));
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&wgpu_host, &surface, None))
            .expect("winit wgpu acquisition");
    let mut state = create_wgpu_render_state(&acquisition.device, None);
    register_wgpu_scene2d_render_preset(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &wgpu_host,
        &acquisition.device,
        &surface,
        None,
    )));

    let scene = Arc::new(create_pump_scene());

    let input = create_input_manager();
    let source = get_winit_host_input_source(&host).clone();
    let ingress = get_winit_host_input_ingress_capability(&host).clone();
    let moved = scene.clone();
    connect_signal(
        &input.read().unwrap().on_pointer_move.clone(),
        Arc::new(move |event| move_pump_scene_shape(&moved, event.x, event.y)),
        None,
    );
    let exit = Arc::new(AtomicBool::new(false));
    let keyboard_exit = exit.clone();
    connect_signal(
        &input.read().unwrap().on_key_down.clone(),
        Arc::new(move |event| {
            if event.key_code == flight_input::KEY_CODE_ESCAPE {
                keyboard_exit.store(true, Ordering::Release);
            }
        }),
        None,
    );
    attach_pointer_input(&ingress, &input, &source, None);
    attach_keyboard_input(&ingress, &input, &source, None);

    let mut proxies = RenderProxies2D::default();
    let target = WgpuRenderTarget::Screen(screen);
    let mut rendered_frames = 0_u64;
    while !exit.load(Ordering::Acquire) {
        match pump_winit_host(&mut host).expect("pump winit host") {
            WinitPumpStatus::Continue => {}
            WinitPumpStatus::Exit(_) => break,
            WinitPumpStatus::Unavailable => {
                panic!(
                    "{}",
                    explain_winit_pump_status(WinitPumpStatus::Unavailable)
                )
            }
        }
        render_pump_scene_frame(&mut state, &mut proxies, &target, &scene);
        rendered_frames += 1;
        if frame_limit.is_some_and(|limit| rendered_frames >= limit) {
            break;
        }
    }

    detach_keyboard_input(&input, &source);
    detach_pointer_input(&input, &source);
    destroy_render_state(&mut state, &mut proxies);
    (wgpu_host.release)(&acquisition);
    destroy_winit_host(host).expect("destroy winit host on creator thread");
}
