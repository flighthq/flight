use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_host_winit::*;
use flight_input::{
    attach_keyboard_input, attach_pointer_input, create_input_manager, detach_keyboard_input,
    detach_pointer_input,
};
use flight_node::{NodeRef, add_node_child};
use flight_render::{
    RenderProxies2D, RenderTargetClear, destroy_render_state, prepare_scene_2d_render,
};
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_acquisition, create_wgpu_render_state,
    create_wgpu_screen_render_target, end_wgpu_render_pass, register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d::{create_display_object, create_sprite};
use flight_scene2d_wgpu::{register_wgpu_scene2d_render_preset, render_wgpu_scene2d};
use flight_shape::{
    Shape, append_shape_begin_fill, append_shape_end_fill, append_shape_rectangle, create_shape,
    register_default_shape_bounds_commands,
};
use flight_signals::connect_signal;
use flight_surface::{SurfaceBase, SurfaceRef, allocate_surface};
use flight_texture::{Texture, TextureSourceRef, create_texture_2d};

fn solid_rectangle(
    color: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> flight_entity::Ref<Shape> {
    let shape = create_shape();
    let bounds = shape.read().unwrap().data.bounds_state.clone();
    register_default_shape_bounds_commands(&bounds);
    append_shape_begin_fill(&shape, color, None);
    append_shape_rectangle(&shape, 0.0, 0.0, width, height);
    append_shape_end_fill(&shape);
    {
        let mut shape = shape.write().unwrap();
        shape.x = x;
        shape.y = y;
    }
    return shape;
}

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

    let root: NodeRef = create_display_object();
    let movable = solid_rectangle(0xff5a5aff, 80.0, 100.0, 140.0, 90.0);
    let second = solid_rectangle(0x42c8f5ff, 360.0, 220.0, 180.0, 120.0);
    let sprite = create_sprite();
    {
        let mut sprite = sprite.write().unwrap();
        let source: TextureSourceRef =
            Arc::new(RwLock::new(create_bitmap(96, 96, Some(0xf7c948ff))));
        let mut texture = create_texture_2d();
        texture.source = Some(source);
        sprite.data.texture = Some(Arc::new(RwLock::new(Texture::Texture2D(texture))));
        sprite.x = 620.0;
        sprite.y = 420.0;
    }
    let movable_node: NodeRef = movable.clone();
    let second_node: NodeRef = second;
    let sprite_node: NodeRef = sprite;
    add_node_child(&root, &movable_node);
    add_node_child(&root, &second_node);
    add_node_child(&root, &sprite_node);

    let input = create_input_manager();
    let source = get_winit_host_input_source(&host).clone();
    let ingress = get_winit_host_input_ingress_capability(&host).clone();
    let moved = movable.clone();
    connect_signal(
        &input.read().unwrap().on_pointer_move.clone(),
        Arc::new(move |event| {
            let mut shape = moved.write().unwrap();
            shape.x = event.x - 70.0;
            shape.y = event.y - 45.0;
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

    let mut proxies = RenderProxies2D::default();
    let clear = RenderTargetClear {
        color: Some([0.03, 0.04, 0.07, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
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
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut pass = begin_wgpu_render_pass(&mut state, &target, Some(&clear));
        render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
        end_wgpu_render_pass(pass);
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
