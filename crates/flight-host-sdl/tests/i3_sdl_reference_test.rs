use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_host_sdl::*;
use flight_node::{NodeRef, add_node_child};
use flight_render::{
    RenderProxies2D, RenderTargetClear, RenderTargetDescriptor, destroy_render_state,
    prepare_scene_2d_render,
};
use flight_render_gl::{
    GlRenderState, begin_gl_render_pass, create_gl_context, create_gl_context_state,
    create_gl_render_state, create_gl_texture_render_target, destroy_gl_render_state,
    destroy_gl_texture_render_target, end_gl_render_pass, register_gl_bitmap_texture_resolver,
};
use flight_render_wgpu::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_bitmap_from_wgpu_screen_render_target,
    create_wgpu_acquisition, create_wgpu_render_state, create_wgpu_screen_render_target,
    destroy_wgpu_screen_render_target, enable_wgpu_screen_render_target_capture,
    end_wgpu_render_pass, register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d::{create_display_object, create_sprite};
use flight_scene2d_gl::{gl_scene2d_render_preset, render_gl_scene2d};
use flight_scene2d_wgpu::{register_wgpu_scene2d_render_preset, render_wgpu_scene2d};
use flight_texture::{Texture, TextureSourceRef, create_texture_2d};
use glow::{HasContext, PixelPackData};

const WIDTH: u32 = 64;
const HEIGHT: u32 = 64;

fn clear() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.04, 0.06, 0.09, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn reference_scene() -> NodeRef {
    let root: NodeRef = create_display_object();
    let first = solid_sprite(0x35b8f2ff, 8.0, 8.0, 24, 20);
    let second = solid_sprite(0xf2c94cff, 38.0, 36.0, 18, 16);
    add_node_child(&root, &first);
    add_node_child(&root, &second);
    return root;
}

fn render_gl_reference() -> Vec<u8> {
    let host = create_sdl_host(&create_sdl_host_options(
        "Flight SDL GL reference",
        f64::from(WIDTH),
        f64::from(HEIGHT),
        false,
        SdlHostRenderBackend::Gl,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    make_sdl_host_gl_context_current(&host).expect("make GL current");
    let surface = create_sdl_host_surface(&host);
    let host_context = (get_sdl_host_gl_capability(&host)
        .expect("GL capability")
        .acquire)(&surface, None)
    .expect("GL token");
    // SAFETY: the SDL host made this exact context current on this creator thread.
    let gl = unsafe { create_gl_context(&host_context) }.expect("create glow context");
    // SAFETY: desktop core GL requires one VAO to be bound before Flight's vertex draws.
    let vertex_array = unsafe {
        let vertex_array = gl
            .create_vertex_array()
            .expect("create core GL vertex array");
        gl.bind_vertex_array(Some(vertex_array));
        vertex_array
    };
    let context_state = create_gl_context_state(gl.clone()).expect("create GL context state");
    let options = gl_scene2d_render_preset();
    let mut state = create_gl_render_state(context_state, Some(&options));
    register_gl_bitmap_texture_resolver(&mut state);
    let descriptor = RenderTargetDescriptor {
        width: f64::from(WIDTH),
        height: f64::from(HEIGHT),
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: Some(1.0),
        depth: None,
        color_space: None,
    };
    let mut target = create_gl_texture_render_target(&state, &descriptor, None)
        .expect("allocate GL reference target")
        .expect("supported GL reference target");
    let root = reference_scene();
    let mut proxies = RenderProxies2D::<GlRenderState>::default();
    prepare_scene_2d_render(&mut state, &mut proxies, &root);
    let pass = begin_gl_render_pass(&state, &target, Some(&clear()), None).expect("begin GL pass");
    render_gl_scene2d(&mut state, &mut proxies, &pass, &root, None);
    end_gl_render_pass(&state, &pass).expect("end GL pass");

    let mut bottom_up = vec![0_u8; (WIDTH * HEIGHT * 4) as usize];
    // SAFETY: the texture target belongs to the current SDL GL context and output is valid.
    unsafe {
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, Some(target.framebuffer));
        gl.read_buffer(glow::COLOR_ATTACHMENT0);
        gl.read_pixels(
            0,
            0,
            WIDTH as i32,
            HEIGHT as i32,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelPackData::Slice(Some(&mut bottom_up)),
        );
        gl.finish();
        gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, None);
    }
    present_sdl_host_gl(&host).expect("swap GL reference");
    let mut top_down = vec![0_u8; bottom_up.len()];
    let row_bytes = WIDTH as usize * 4;
    for row in 0..HEIGHT as usize {
        let source = (HEIGHT as usize - 1 - row) * row_bytes;
        let destination = row * row_bytes;
        top_down[destination..destination + row_bytes]
            .copy_from_slice(&bottom_up[source..source + row_bytes]);
    }

    destroy_gl_render_state(&mut state, &mut proxies);
    destroy_gl_texture_render_target(&mut target);
    drop(target);
    drop(state);
    // SAFETY: the VAO belongs to this still-current host context and is no longer referenced.
    unsafe { gl.delete_vertex_array(vertex_array) };
    drop(gl);
    drop(host_context);
    destroy_sdl_host(host).expect("destroy GL reference host");
    return top_down;
}

fn render_wgpu_reference() -> Vec<u8> {
    let host = create_sdl_host(&create_sdl_host_options(
        "Flight SDL wgpu reference",
        f64::from(WIDTH),
        f64::from(HEIGHT),
        false,
        SdlHostRenderBackend::Wgpu,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    let capability = get_sdl_host_wgpu_capability(&host)
        .expect("wgpu capability")
        .clone();
    let device = get_sdl_host_wgpu_device(&host)
        .expect("wgpu device")
        .clone();
    let surface = create_sdl_host_surface(&host);
    let acquisition =
        futures::executor::block_on(create_wgpu_acquisition(&capability, &surface, None))
            .expect("wgpu acquisition");
    let mut state = create_wgpu_render_state(&device, None);
    register_wgpu_scene2d_render_preset(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    let screen = Arc::new(RwLock::new(create_wgpu_screen_render_target(
        &capability,
        &device,
        &surface,
        None,
    )));
    enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
    let target = WgpuRenderTarget::Screen(screen.clone());
    let root = reference_scene();
    let mut proxies = RenderProxies2D::default();
    prepare_scene_2d_render(&mut state, &mut proxies, &root);
    let mut pass = begin_wgpu_render_pass(&mut state, &target, Some(&clear()));
    render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
    end_wgpu_render_pass(pass);
    let bitmap = futures::executor::block_on(create_bitmap_from_wgpu_screen_render_target(
        &screen,
        Some(5_000),
    ))
    .expect("bounded wgpu reference capture");
    let pixels = bitmap.data.to_vec();

    destroy_render_state(&mut state, &mut proxies);
    destroy_wgpu_screen_render_target(&mut screen.write().unwrap());
    drop(target);
    drop(screen);
    drop(state);
    drop(acquisition);
    destroy_sdl_host(host).expect("destroy wgpu reference host");
    return pixels;
}

fn solid_sprite(color: u32, x: f64, y: f64, width: u32, height: u32) -> NodeRef {
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

fn assert_sentinel(pixels: &[u8], x: usize, y: usize, expected: [u8; 4], tolerance: u8) {
    let offset = (y * WIDTH as usize + x) * 4;
    let pixel = &pixels[offset..offset + 4];
    for (actual, expected) in pixel.iter().zip(expected) {
        assert!(
            actual.abs_diff(expected) <= tolerance,
            "sentinel ({x},{y}) {pixel:?}"
        );
    }
}

fn is_primitive_edge(x: usize, y: usize) -> bool {
    return [8, 31, 38, 55]
        .into_iter()
        .any(|edge| x.abs_diff(edge) <= 1)
        || [8, 27, 36, 51]
            .into_iter()
            .any(|edge| y.abs_diff(edge) <= 1);
}

fn main() {
    if !display_available() {
        eprintln!("SKIP I3 SDL reference: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }
    let wgpu = render_wgpu_reference();
    let gl = render_gl_reference();
    assert_eq!(wgpu.len(), gl.len());
    assert_sentinel(&wgpu, 2, 2, [10, 15, 23, 255], 4);
    assert_sentinel(&gl, 2, 2, [10, 15, 23, 255], 4);
    assert_sentinel(&wgpu, 16, 16, [53, 184, 242, 255], 8);
    assert_sentinel(&gl, 16, 16, [53, 184, 242, 255], 8);
    assert_sentinel(&wgpu, 46, 44, [242, 201, 76, 255], 8);
    assert_sentinel(&gl, 46, 44, [242, 201, 76, 255], 8);

    let mut maximum = 0_u8;
    let mut sum = 0_u64;
    let mut count = 0_u64;
    for y in 0..HEIGHT as usize {
        for x in 0..WIDTH as usize {
            if is_primitive_edge(x, y) {
                continue;
            }
            let offset = (y * WIDTH as usize + x) * 4;
            for channel in 0..4 {
                let delta = wgpu[offset + channel].abs_diff(gl[offset + channel]);
                maximum = maximum.max(delta);
                sum += u64::from(delta);
                count += 1;
            }
        }
    }
    let mean = sum as f64 / count as f64;
    assert!(maximum <= 8, "maximum channel delta {maximum}");
    assert!(mean <= 1.5, "mean absolute channel delta {mean}");
}
