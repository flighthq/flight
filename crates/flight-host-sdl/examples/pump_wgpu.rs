use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_host_sdl::*;
use flight_input::{
    attach_gamepad_input, attach_keyboard_input, attach_pointer_input, create_input_manager,
    detach_gamepad_input, detach_keyboard_input, detach_pointer_input,
};
use flight_node::{NodeRef, add_node_child};
use flight_render::{
    RenderProxies2D, RenderTargetClear, destroy_render_state, prepare_scene_2d_render,
};
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_acquisition, create_wgpu_render_state,
    create_wgpu_screen_render_target, destroy_wgpu_screen_render_target, end_wgpu_render_pass,
    register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d::{create_display_object, create_sprite};
use flight_scene2d_wgpu::{register_wgpu_scene2d_render_preset, render_wgpu_scene2d};
use flight_signals::connect_signal;
use flight_texture::{Texture, TextureSourceRef, create_texture_2d};

fn solid_sprite(
    color: u32,
    x: f64,
    y: f64,
    width: u32,
    height: u32,
) -> flight_entity::Ref<flight_scene2d::Sprite> {
    let sprite = create_sprite();
    {
        let mut sprite = sprite.write().unwrap();
        let source: TextureSourceRef =
            Arc::new(RwLock::new(create_bitmap(width, height, Some(color))));
        let mut texture = create_texture_2d();
        texture.source = Some(source);
        sprite.data.texture = Some(Arc::new(RwLock::new(Texture::Texture2D(texture))));
        sprite.x = x;
        sprite.y = y;
    }
    return sprite;
}

fn main() {
    let frame_limit = std::env::var("FLIGHT_SDL_EXAMPLE_FRAMES")
        .ok()
        .and_then(|value| value.parse::<u64>().ok());
    let mut host = create_sdl_host(&create_sdl_host_options(
        "Flight SDL wgpu pump",
        800.0,
        600.0,
        true,
        SdlHostRenderBackend::Wgpu,
    ))
    .unwrap_or_else(|failure| panic!("{}", explain_sdl_host_failure(&failure)));

    let capability = get_sdl_host_wgpu_capability(&host)
        .expect("the explicitly selected wgpu backend must expose its capability")
        .clone();
    let device = get_sdl_host_wgpu_device(&host)
        .expect("the explicitly selected wgpu backend must expose its device")
        .clone();
    let surface = create_sdl_host_surface(&host);
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&capability, &surface, None))
            .expect("acquire the canonical SDL wgpu surface");
    let mut state = create_wgpu_render_state(&device, None);
    register_wgpu_scene2d_render_preset(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &capability,
        &device,
        &surface,
        None,
    )));
    let target = WgpuRenderTarget::Screen(screen.clone());

    let root: NodeRef = create_display_object();
    let movable = solid_sprite(0xff5a5aff, 80.0, 100.0, 140, 90);
    let second = solid_sprite(0x42c8f5ff, 360.0, 220.0, 180, 120);
    let movable_node: NodeRef = movable.clone();
    let second_node: NodeRef = second;
    add_node_child(&root, &movable_node);
    add_node_child(&root, &second_node);

    let input = create_input_manager();
    let source = get_sdl_host_input_source(&host).clone();
    let ingress = get_sdl_host_input_ingress_capability(&host).clone();
    let moved = movable.clone();
    connect_signal(
        &input.read().unwrap().on_pointer_move.clone(),
        Arc::new(move |event| {
            let mut sprite = moved.write().unwrap();
            sprite.x = event.x - 70.0;
            sprite.y = event.y - 45.0;
        }),
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
    attach_gamepad_input(&ingress, &input, &source, None);

    let clear = RenderTargetClear {
        color: Some([0.03, 0.04, 0.07, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    let mut proxies = RenderProxies2D::default();
    let mut rendered_frames = 0_u64;
    while !exit.load(Ordering::Acquire) {
        match pump_sdl_host(&mut host)
            .unwrap_or_else(|failure| panic!("{}", explain_sdl_host_failure(&failure)))
        {
            SdlPumpStatus::Continue => {}
            SdlPumpStatus::Exit(_) => break,
        }
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut pass = begin_wgpu_render_pass(&mut state, &target, Some(&clear));
        render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
        end_wgpu_render_pass(pass);
        rendered_frames += 1;
        if frame_limit.is_some_and(|limit| rendered_frames >= limit) {
            break;
        }
    }

    detach_gamepad_input(&input, &source);
    detach_keyboard_input(&input, &source);
    detach_pointer_input(&input, &source);
    destroy_render_state(&mut state, &mut proxies);
    destroy_wgpu_screen_render_target(&mut screen.write().unwrap());
    drop(target);
    drop(screen);
    drop(state);
    (capability.release)(&acquisition);
    drop(acquisition);
    destroy_sdl_host(host)
        .unwrap_or_else(|failure| panic!("{}", explain_sdl_host_failure(&failure)));
}
