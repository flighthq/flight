//! The `rnat:gl` cell: render a scene through `displayobject-gl` (glow) on a
//! headless GLES 3.0 context.
//!
//! `render-gl`'s shaders are `#version 300 es`, so this opens an OpenGL ES 3.0
//! context via EGL — surfaceless where the driver supports it, falling back to
//! the default display — loaded dynamically through `khronos-egl` so a box with
//! no `libEGL` degrades to a skipped cell (every entry returns `None` on any
//! EGL/GL failure) rather than failing the build or the run. The scene renders
//! into an off-screen RGBA8 framebuffer object; the read-back rows are flipped
//! from GL's bottom-left origin to the top-left origin the other cells use.
//!
//! Full-frame effects are not yet wired here (they would run through
//! `effects-gl`); like the software cell, a scene that carries an effect chain
//! returns `None` so the matrix reports a clean "unsupported" cell instead of an
//! ungraded frame.

use flighthq_displayobject_gl::{
    GlShapeGeometry, register_gl_display_object_renderer, render_gl_display_object,
};
use flighthq_render_gl::{GlRenderOptions, create_gl_render_state, render_gl_background};
use glow::HasContext;
use khronos_egl as egl;

use crate::scene::Scene;
use crate::scene_graph::{SceneGraph, build_scene_graph};

/// `EGL_PLATFORM_SURFACELESS_MESA` — the surfaceless platform for headless Mesa,
/// preferred when available so no window-system surface is needed.
const PLATFORM_SURFACELESS_MESA: egl::Enum = 0x3199;
/// `EGL_OPENGL_ES3_BIT` — the renderable-type bit for an ES 3.0 config.
const OPENGL_ES3_BIT: egl::Int = 0x0040;

type EglInstance = egl::DynamicInstance<egl::EGL1_5>;

/// Renders a scene to tightly packed straight-alpha RGBA bytes (`w*h*4`,
/// top-left origin) via a headless GLES 3.0 context and `displayobject-gl`.
/// Returns `None` when no EGL/GL context can be created (the cell is skipped) or
/// when the scene carries an effect chain the gl cell does not yet apply.
pub fn render_scene_to_rgba_gl(scene: &Scene) -> Option<Vec<u8>> {
    // Effects would run through effects-gl; not wired into this cell yet.
    if !(scene.effects)().is_empty() {
        return None;
    }
    if scene.width == 0 || scene.height == 0 {
        return None;
    }

    // `_egl` is declared before `state` so it drops *after* it: the GL resources
    // owned by the render state are freed while the EGL context is still current,
    // then the EGL context itself is released.
    let (_egl, gl) = EglContext::create()?;
    let SceneGraph {
        stage_id,
        children,
        kinds,
        proxies,
        regions,
    } = build_scene_graph(scene);

    let mut state = create_gl_render_state(
        gl,
        &GlRenderOptions {
            background_color: Some(scene.background),
            ..GlRenderOptions::default()
        },
    );

    // The shape-fill NDC projection reads the state's default viewport; without
    // it the dimensions collapse to 1x1 and every shape covers the whole frame.
    state.runtime.default_viewport_width = scene.width;
    state.runtime.default_viewport_height = scene.height;

    // Off-screen RGBA8 framebuffer the scene renders into; read back after draw.
    let (fbo, color_tex) = create_offscreen_fbo(&state.gl, scene.width, scene.height)?;
    unsafe {
        state
            .gl
            .viewport(0, 0, scene.width as i32, scene.height as i32);
    }

    register_gl_display_object_renderer(&mut state);
    render_gl_background(&mut state);

    let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
    let get_kind = |id: u64| kinds.get(&id).copied().unwrap_or_default();
    let get_proxy = |id: u64| proxies.get(&id).cloned();
    let get_shape_geometry = |id: u64| {
        regions
            .get(&id)
            .map(|(regions, content_revision)| GlShapeGeometry {
                regions: regions.clone(),
                content_revision: *content_revision,
            })
    };

    render_gl_display_object(
        &mut state,
        stage_id,
        &get_children,
        &get_kind,
        &get_proxy,
        &get_shape_geometry,
    );

    let pixels = read_fbo_rgba(&state.gl, scene.width, scene.height);

    unsafe {
        state.gl.delete_framebuffer(fbo);
        state.gl.delete_texture(color_tex);
    }
    Some(pixels)
}

/// Creates an RGBA8 framebuffer object sized `w`x`h` and binds it as the draw
/// target. Returns the framebuffer and its color texture for later teardown, or
/// `None` if the framebuffer is incomplete.
fn create_offscreen_fbo(
    gl: &glow::Context,
    width: u32,
    height: u32,
) -> Option<(glow::Framebuffer, glow::Texture)> {
    unsafe {
        let fbo = gl.create_framebuffer().ok()?;
        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(fbo));

        let tex = gl.create_texture().ok()?;
        gl.bind_texture(glow::TEXTURE_2D, Some(tex));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA8 as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            None,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MIN_FILTER,
            glow::NEAREST as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MAG_FILTER,
            glow::NEAREST as i32,
        );
        gl.framebuffer_texture_2d(
            glow::FRAMEBUFFER,
            glow::COLOR_ATTACHMENT0,
            glow::TEXTURE_2D,
            Some(tex),
            0,
        );

        if gl.check_framebuffer_status(glow::FRAMEBUFFER) != glow::FRAMEBUFFER_COMPLETE {
            gl.delete_framebuffer(fbo);
            gl.delete_texture(tex);
            return None;
        }
        Some((fbo, tex))
    }
}

/// Reads the bound framebuffer's RGBA8 pixels and flips them from GL's
/// bottom-left origin to the top-left origin the other render cells use.
fn read_fbo_rgba(gl: &glow::Context, width: u32, height: u32) -> Vec<u8> {
    let row = (width * 4) as usize;
    let mut bottom_up = vec![0u8; row * height as usize];
    unsafe {
        gl.finish();
        gl.read_pixels(
            0,
            0,
            width as i32,
            height as i32,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            glow::PixelPackData::Slice(&mut bottom_up),
        );
    }

    let mut top_down = vec![0u8; bottom_up.len()];
    for y in 0..height as usize {
        let src = (height as usize - 1 - y) * row;
        let dst = y * row;
        top_down[dst..dst + row].copy_from_slice(&bottom_up[src..src + row]);
    }
    top_down
}

/// A current headless GLES 3.0 EGL context. Held for the render's duration and
/// torn down on drop; the loaded `glow::Context` is returned alongside it (and
/// moved into the render state) so the state can own GL while this guard owns the
/// EGL handles. One context per call keeps the path thread-safe under the
/// parallel runner — each worker thread makes its own context current.
struct EglContext {
    egl: EglInstance,
    display: egl::Display,
    context: egl::Context,
}

impl EglContext {
    /// Loads EGL dynamically, opens a headless GLES 3.0 context (surfaceless when
    /// available, else the default display), makes it current, and loads GL.
    /// Returns the guard plus the loaded `glow::Context`, or `None` on any
    /// failure so the gl cell is cleanly skipped.
    fn create() -> Option<(EglContext, glow::Context)> {
        let egl = unsafe { EglInstance::load_required() }.ok()?;

        // Prefer the surfaceless platform explicitly; where the core 1.5
        // `eglGetPlatformDisplay` rejects it (`BadParameter`), fall back to
        // `eglGetDisplay(DEFAULT_DISPLAY)`, which Mesa routes to the surfaceless
        // platform when `EGL_PLATFORM=surfaceless` is set (see `ensure_egl_platform`).
        let display = unsafe {
            egl.get_platform_display(
                PLATFORM_SURFACELESS_MESA,
                egl::DEFAULT_DISPLAY,
                &[egl::ATTRIB_NONE],
            )
        }
        .ok()
        .or_else(|| unsafe { egl.get_display(egl::DEFAULT_DISPLAY) })?;

        egl.initialize(display).ok()?;
        egl.bind_api(egl::OPENGL_ES_API).ok()?;

        let config = egl
            .choose_first_config(
                display,
                &[
                    egl::SURFACE_TYPE,
                    egl::PBUFFER_BIT,
                    egl::RENDERABLE_TYPE,
                    OPENGL_ES3_BIT,
                    egl::RED_SIZE,
                    8,
                    egl::GREEN_SIZE,
                    8,
                    egl::BLUE_SIZE,
                    8,
                    egl::ALPHA_SIZE,
                    8,
                    egl::NONE,
                ],
            )
            .ok()??;

        let context = egl
            .create_context(
                display,
                config,
                None,
                &[egl::CONTEXT_MAJOR_VERSION, 3, egl::NONE],
            )
            .ok()?;

        // Surfaceless make-current (no draw/read surface); the scene renders into
        // an application FBO. Requires EGL_KHR_surfaceless_context (Mesa has it).
        egl.make_current(display, None, None, Some(context)).ok()?;

        let gl = unsafe {
            glow::Context::from_loader_function(|name| match egl.get_proc_address(name) {
                Some(p) => p as *const std::ffi::c_void,
                None => std::ptr::null(),
            })
        };

        Some((
            EglContext {
                egl,
                display,
                context,
            },
            gl,
        ))
    }
}

impl Drop for EglContext {
    fn drop(&mut self) {
        // Release the context from this thread and destroy it. The display is
        // intentionally left initialized (not terminated): EGL_DEFAULT_DISPLAY is
        // process-global, so terminating it could pull the rug from a sibling
        // worker thread rendering concurrently. Leaking the per-process display
        // init is harmless for a test-run binary.
        let _ = self.egl.make_current(self.display, None, None, None);
        let _ = self.egl.destroy_context(self.display, self.context);
    }
}
