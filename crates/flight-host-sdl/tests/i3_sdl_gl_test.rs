use flight_host_sdl::*;
use flight_render::{RenderProxies2D, RenderTargetClear};
use flight_render_gl::{
    GlRenderState, begin_gl_render_pass, create_gl_context, create_gl_context_state,
    create_gl_render_state, create_gl_screen_render_target, destroy_gl_render_state,
    end_gl_render_pass,
};
use glow::{HasContext, PixelPackData};

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn main() {
    if !display_available() {
        eprintln!("SKIP I3 SDL GL: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }

    let mut host = create_sdl_host(&create_sdl_host_options(
        "Flight I3 SDL GL",
        320.0,
        240.0,
        true,
        SdlHostRenderBackend::Gl,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    make_sdl_host_gl_context_current(&host).expect("make GL context current");
    let surface = create_sdl_host_surface(&host);
    let host_context = (get_sdl_host_gl_capability(&host)
        .expect("selected GL capability")
        .acquire)(&surface, None)
    .expect("host GL context token");
    // SAFETY: the host made this exact native context current on this creator thread.
    let gl = unsafe { create_gl_context(&host_context) }.expect("create glow context");
    let context_state = create_gl_context_state(gl.clone()).expect("create GL context state");
    let mut render_state = create_gl_render_state(context_state, None);
    let mut screen = create_gl_screen_render_target(gl.clone(), 320, 240);
    let clear = RenderTargetClear {
        color: Some([0.12, 0.48, 0.78, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };

    for _ in 0..4 {
        assert_eq!(
            pump_sdl_host(&mut host).expect("pump"),
            SdlPumpStatus::Continue
        );
        let pass = begin_gl_render_pass(&render_state, &screen, Some(&clear), None)
            .expect("begin screen render pass");
        end_gl_render_pass(&render_state, &pass).expect("end screen render pass");
        // SAFETY: framebuffer zero is the SDL window back buffer for the current context.
        unsafe { gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, None) };
        present_sdl_host_gl(&host).expect("swap SDL GL window");
    }

    let display = get_sdl_host_surface_display_capability(&host)
        .expect("display capability")
        .clone();
    (display.set_display_size)(&surface, 200.0, 150.0);
    pump_sdl_host(&mut host).expect("resize pump");
    screen.width = 200;
    screen.height = 150;
    let pass = begin_gl_render_pass(&render_state, &screen, Some(&clear), None)
        .expect("begin resized render pass");
    end_gl_render_pass(&render_state, &pass).expect("end resized render pass");

    let mut pixel = [0_u8; 4];
    // SAFETY: the default framebuffer belongs to the current SDL GL context and the output is valid.
    unsafe {
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, None);
        assert!(!gl.is_enabled(glow::FRAMEBUFFER_SRGB));
        assert_eq!(
            gl.get_framebuffer_attachment_parameter_i32(
                glow::FRAMEBUFFER,
                glow::BACK_LEFT,
                glow::FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING,
            ),
            glow::SRGB as i32
        );
        gl.read_pixels(
            100,
            75,
            1,
            1,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelPackData::Slice(Some(&mut pixel)),
        );
    }
    assert_eq!(pixel, [31, 122, 199, 255]);
    // SAFETY: framebuffer zero must be bound before the SDL window swap, notably on macOS.
    unsafe { gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, None) };
    present_sdl_host_gl(&host).expect("swap resized SDL GL window");

    let mut proxies = RenderProxies2D::<GlRenderState>::default();
    destroy_gl_render_state(&mut render_state, &mut proxies);
    drop(screen);
    drop(render_state);
    drop(gl);
    drop(host_context);
    destroy_sdl_host(host).expect("destroy after thread-bound GL state");
}
