//! GlRenderState — creation, runtime access, and teardown.

use std::collections::HashMap;

use glow::HasContext;

use crate::material_registry::GlMaterialRenderer;
use crate::shader::{GlBitmapShader, GlShaderLocations, compile_default_gl_program};

// ---------------------------------------------------------------------------
// GlRenderOptions
// ---------------------------------------------------------------------------

/// Options passed to `create_gl_render_state`.
#[derive(Clone, Debug)]
pub struct GlRenderOptions {
    /// Enable MSAA antialiasing on the default framebuffer. Default: `true`.
    pub antialias: bool,
    /// Allow linear texture filtering. Default: `true`.
    pub image_smoothing_enabled: bool,
    /// Device pixel ratio for HiDPI scaling. Default: `1.0`.
    pub pixel_ratio: f32,
    /// Round pixel coordinates before rendering. Default: `false`.
    pub round_pixels: bool,
    /// Packed RGBA background color (`0xRRGGBBaa`). Default: `0`.
    pub background_color: Option<u32>,
}

impl Default for GlRenderOptions {
    fn default() -> Self {
        Self {
            antialias: true,
            image_smoothing_enabled: true,
            pixel_ratio: 1.0,
            round_pixels: false,
            background_color: None,
        }
    }
}

// ---------------------------------------------------------------------------
// GlRenderTarget
// ---------------------------------------------------------------------------

/// A framebuffer-backed off-screen render target.
#[derive(Debug)]
pub struct GlRenderTarget {
    pub width: u32,
    pub height: u32,
    pub format: GlRenderTargetFormat,
    pub sample_count: u32,
    pub framebuffer: glow::Framebuffer,
    pub resolve_framebuffer: Option<glow::Framebuffer>,
    pub textures: Vec<glow::Texture>,
    /// Primary resolved color texture (alias for `textures[0]`).
    pub texture: glow::Texture,
    pub depth_texture: Option<glow::Texture>,
    pub color_renderbuffers: Vec<glow::Renderbuffer>,
    pub depth_stencil_renderbuffer: Option<glow::Renderbuffer>,
}

/// Color format for a `GlRenderTarget`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GlRenderTargetFormat {
    #[default]
    Rgba8,
    Rgba16F,
    Rgba32F,
}

// ---------------------------------------------------------------------------
// GPU-state slot types
//
// These plain handle/data types are embedded in `GlRenderStateRuntime` and
// filled by the per-subject leaf renderers in `flighthq-displayobject-gl`. They
// live in the core because the runtime struct owns them by value and
// `destroy_gl_render_state` frees their GPU resources. This mirrors the TS
// design, where the equivalent types live in `@flighthq/types` (the header
// layer) so out-of-package renderers can reach the same state. (glow handles
// cannot live in the Rust `flighthq-types` header, so the core crate is the
// header tier for them.)
// ---------------------------------------------------------------------------

/// Per-state sprite batch runtime fields. Embedded in `GlRenderStateRuntime`,
/// written by `flighthq-displayobject-gl`'s sprite-batch path.
#[derive(Default)]
pub struct GlSpriteBatchRuntime {
    pub blend_mode: Option<flighthq_types::blend::BlendMode>,
    /// Currently bound texture key (id used as opaque identity).
    pub texture_key: u64,
    pub material_id: u64,
    pub material_renderer_id: u64,
    pub material_floats: u32,
    pub count: u32,
    pub instance_data: Vec<f32>,
    pub material_data: Vec<f32>,
    pub instance_buffer: Option<glow::Buffer>,
    pub material_buffer: Option<glow::Buffer>,
    /// Corner buffer (loc 0, divisor 0) for instanced draw.
    pub corner_buffer: Option<glow::Buffer>,
    /// Compiled instanced quad-batch shader.
    pub quad_batch_shader: Option<GlQuadBatchShader>,
}

/// Locations for the instanced quad-batch program.
#[derive(Debug)]
pub struct GlQuadBatchShader {
    pub program: glow::Program,
    pub loc_corner: u32,
    pub loc_mat_ab: u32,
    pub loc_mat_cd: u32,
    pub loc_mat_txty: u32,
    pub loc_size: u32,
    pub loc_uv_rect: u32,
    pub loc_alpha: u32,
    pub loc_world_matrix: Option<glow::UniformLocation>,
    pub loc_texture: Option<glow::UniformLocation>,
}

/// A compiled, cached solid-fill program and its uniform/attribute locations.
#[derive(Clone, Debug)]
pub struct GlShapeFillProgram {
    pub program: glow::Program,
    pub loc_position: u32,
    pub loc_matrix: Option<glow::UniformLocation>,
    pub loc_color: Option<glow::UniformLocation>,
}

/// A GPU triangle mesh for one solid-color fill region of a vector shape.
#[derive(Debug)]
pub struct GlShapeFillMesh {
    pub vertex_buffer: glow::Buffer,
    pub index_buffer: glow::Buffer,
    pub index_count: u32,
    /// Packed `0xRRGGBBaa` fill color (alpha already folded with the region alpha).
    pub color: u32,
}

/// Cached, uploaded meshes for one shape node, tagged with the source
/// `content_revision` so the cache is invalidated when geometry changes.
#[derive(Debug)]
pub struct GlShapeFillMeshCacheEntry {
    pub content_revision: u32,
    pub meshes: Vec<GlShapeFillMesh>,
}

// ---------------------------------------------------------------------------
// GlRenderStateRuntime
// ---------------------------------------------------------------------------

/// A nested-target save record produced by `begin_gl_render_target` and consumed
/// by `end_gl_render_target` to restore framebuffer/viewport/transform state.
#[derive(Clone, Debug)]
pub(crate) struct GlRenderTargetSave {
    pub framebuffer: Option<glow::Framebuffer>,
    pub viewport: Option<GlViewport>,
    pub render_transform: Option<flighthq_types::geometry::Matrix>,
}

/// Package-private per-frame mutable GL state. Attached to `GlRenderState` and
/// written every frame by the render path. Not part of the public API.
#[derive(Default)]
pub struct GlRenderStateRuntime {
    pub current_blend_mode: Option<flighthq_types::blend::BlendMode>,
    pub current_framebuffer: Option<glow::Framebuffer>,
    pub current_mask_depth: u32,
    pub current_program: Option<glow::Program>,
    pub current_scissor_rect: Option<GlScissorRect>,
    pub current_texture: Option<glow::Texture>,
    pub render_target_viewport: Option<GlViewport>,
    /// Default framebuffer dimensions, used for NDC matrix construction when no
    /// off-screen target viewport is bound.
    pub default_viewport_width: u32,
    pub default_viewport_height: u32,
    pub shader_loc: Option<GlShaderLocations>,
    /// The default bitmap shader bound when no material/per-node shader applies.
    pub default_bitmap_shader: Option<GlBitmapShader>,
    /// Compiled color-transform bitmap shader (lazily registered).
    pub color_transform_bitmap_shader: Option<GlBitmapShader>,
    pub matrix_array: [f32; 9],
    pub scissor_stack: Vec<GlScissorRect>,
    pub clip_forms: Vec<GlClipForm>,
    pub sprite_batch: GlSpriteBatchRuntime,
    pub quad_vertex_buffer: Option<glow::Buffer>,
    pub quad_index_buffer: Option<glow::Buffer>,
    pub quad_vertex_data: [f32; 16],
    /// Texture cache keyed by an opaque image identity (image source id). Native
    /// GL has no WeakMap; the cache is cleared explicitly via dispose paths.
    pub texture_cache: HashMap<u64, glow::Texture>,
    /// Per-node custom shader overrides, keyed by render proxy id.
    pub shader_bindings: HashMap<u64, GlBitmapShader>,
    /// Material-kind shader registry (custom material bitmap shaders).
    pub material_shaders: HashMap<flighthq_types::kind::KindId, GlBitmapShader>,
    /// Material-kind renderer registry for the instanced sprite batch.
    pub material_renderers: HashMap<flighthq_types::kind::KindId, Box<dyn GlMaterialRenderer>>,
    /// Registered renderers keyed by node kind (display object / sprite / bitmap).
    pub renderers: HashMap<flighthq_types::kind::KindId, GlRendererSlot>,
    /// Compiled solid-fill program for tessellated `Shape` nodes, lazily built
    /// on first shape draw. Mirrors the wgpu shape-fill pipeline cache.
    pub shape_fill_program: Option<GlShapeFillProgram>,
    /// Per-node tessellated fill mesh cache, keyed by shape node id and
    /// invalidated by `content_revision`. Mirrors `shape_fill_mesh_cache` in
    /// render-wgpu.
    pub shape_fill_mesh_cache: HashMap<u64, GlShapeFillMeshCacheEntry>,
    /// Stack of saved target state for nested `begin/end_gl_render_target`.
    pub(crate) render_target_stack: Vec<GlRenderTargetSave>,
    /// Framebuffer-backed cache targets, keyed by cache id. Owned by the state
    /// that bakes them (`refresh_gl_render_cache`).
    pub render_cache_targets: std::collections::HashMap<u64, GlRenderTarget>,
}

/// Identifies which built-in renderer handles a node kind. The Rust port keeps a
/// small enum here rather than trait objects so the dispatch in
/// `render_gl_display_object` stays a plain match.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum GlRendererSlot {
    Container,
    Bitmap,
    Shape,
    Sprite,
}

/// Axis-aligned scissor rectangle in GL window coordinates (Y-up, pixels).
#[derive(Copy, Clone, Debug, Default)]
pub struct GlScissorRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Viewport dimensions recorded while rendering into an off-screen target.
#[derive(Copy, Clone, Debug, Default)]
pub struct GlViewport {
    pub width: u32,
    pub height: u32,
}

/// Records which hardware gate was used for each pushed clip layer.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum GlClipForm {
    Rect,
    Contour,
}

// ---------------------------------------------------------------------------
// GlRenderState
// ---------------------------------------------------------------------------

/// Top-level state for a single OpenGL 2D rendering context.
///
/// Wraps a `glow::Context` and owns all per-state GL resources (shaders,
/// vertex/index buffers, texture caches). Concrete renderer registrations are
/// stored on the embedded `render_state`.
pub struct GlRenderState {
    /// Base backend-agnostic render settings.
    pub render_state: flighthq_render::RenderState,
    /// Live GL context (glow HAL, supports OpenGL 3.3 core and OpenGL ES 3.0).
    pub gl: glow::Context,
    /// Mutable per-frame render path state.
    ///
    /// Public so the per-subject leaf renderers in `flighthq-displayobject-gl`
    /// can read and write the runtime slots they own (sprite batch, shape fill,
    /// material renderers, clip). Mirrors the TS design where
    /// `GlRenderStateRuntime` lives in the shared header (`@flighthq/types`) and
    /// out-of-package custom renderers reach the same state.
    pub runtime: GlRenderStateRuntime,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Initialises a `GlRenderState` from an already-current `glow::Context`.
///
/// The caller is responsible for making the context current before calling
/// this function and keeping it current for the lifetime of the state.
///
/// # Panics
/// Panics if required OpenGL resources (shaders, buffers) cannot be created.
pub fn create_gl_render_state(gl: glow::Context, options: &GlRenderOptions) -> GlRenderState {
    let mut render_state = flighthq_render::RenderState {
        allow_smoothing: options.image_smoothing_enabled,
        pixel_ratio: options.pixel_ratio,
        round_pixels: options.round_pixels,
        render_transform_2d: Some(flighthq_types::geometry::Matrix::default()),
        ..Default::default()
    };
    if let Some(background_color) = options.background_color {
        render_state.background_color = background_color;
    }

    let mut runtime = create_gl_render_state_runtime();

    unsafe {
        let shader_loc = compile_default_gl_program(&gl);
        let default_bitmap_shader = GlBitmapShader {
            locations: shader_loc.clone(),
            program: shader_loc.program,
        };

        // Static index buffer [0, 1, 2, 0, 2, 3] for the shared quad.
        let quad_index_buffer = gl.create_buffer().expect("create quad index buffer");
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(quad_index_buffer));
        let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];
        gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            bytemuck_u16(&indices),
            glow::STATIC_DRAW,
        );

        // Dynamic vertex buffer: 4 vertices × 4 floats (x, y, u, v) = 64 bytes.
        let quad_vertex_buffer = gl.create_buffer().expect("create quad vertex buffer");
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(quad_vertex_buffer));
        gl.buffer_data_size(glow::ARRAY_BUFFER, 64, glow::DYNAMIC_DRAW);

        runtime.shader_loc = Some(shader_loc);
        runtime.default_bitmap_shader = Some(default_bitmap_shader);
        runtime.quad_index_buffer = Some(quad_index_buffer);
        runtime.quad_vertex_buffer = Some(quad_vertex_buffer);

        gl.enable(glow::BLEND);
        gl.blend_func(glow::ONE, glow::ONE_MINUS_SRC_ALPHA);
        gl.disable(glow::DEPTH_TEST);
    }

    GlRenderState {
        render_state,
        gl,
        runtime,
    }
}

/// Allocates the package-private per-frame runtime for a `GlRenderState`.
///
/// `create_gl_render_state` calls this internally; it is also exposed so
/// callers can construct a cache state that shares the same GL context.
pub fn create_gl_render_state_runtime() -> GlRenderStateRuntime {
    GlRenderStateRuntime {
        sprite_batch: GlSpriteBatchRuntime {
            instance_data: vec![0.0; 13 * 256],
            material_data: vec![0.0; 8 * 256],
            ..Default::default()
        },
        ..Default::default()
    }
}

/// Frees the GPU resources allocated by `create_gl_render_state`: compiled
/// shader programs and vertex/index/instance buffers.
///
/// User-registered material shaders and per-node texture cache entries are
/// intentionally **not** freed here; see the TS source for the full rationale.
///
/// # Safety
/// The GL context must be current when this is called.
pub fn destroy_gl_render_state(state: &mut GlRenderState) {
    let gl = &state.gl;
    let runtime = &mut state.runtime;

    // Dedupe: several shader wrappers may share the same program handle.
    let mut programs: Vec<glow::Program> = Vec::new();
    let push_program = |p: glow::Program, programs: &mut Vec<glow::Program>| {
        if !programs.contains(&p) {
            programs.push(p);
        }
    };
    if let Some(loc) = &runtime.shader_loc {
        push_program(loc.program, &mut programs);
    }
    if let Some(s) = &runtime.default_bitmap_shader {
        push_program(s.program, &mut programs);
    }
    if let Some(s) = &runtime.color_transform_bitmap_shader {
        push_program(s.program, &mut programs);
    }
    if let Some(s) = &runtime.sprite_batch.quad_batch_shader {
        push_program(s.program, &mut programs);
    }
    if let Some(p) = &runtime.shape_fill_program {
        push_program(p.program, &mut programs);
    }
    // Free the tessellated shape fill mesh buffers (vertex + index per region).
    let shape_meshes: Vec<glow::Buffer> = runtime
        .shape_fill_mesh_cache
        .drain()
        .flat_map(|(_, entry)| {
            entry
                .meshes
                .into_iter()
                .flat_map(|m| [m.vertex_buffer, m.index_buffer])
        })
        .collect();
    unsafe {
        for buffer in shape_meshes {
            gl.delete_buffer(buffer);
        }
        for program in programs {
            gl.delete_program(program);
        }
        if let Some(b) = runtime.quad_vertex_buffer.take() {
            gl.delete_buffer(b);
        }
        if let Some(b) = runtime.quad_index_buffer.take() {
            gl.delete_buffer(b);
        }
        if let Some(b) = runtime.sprite_batch.instance_buffer.take() {
            gl.delete_buffer(b);
        }
        if let Some(b) = runtime.sprite_batch.material_buffer.take() {
            gl.delete_buffer(b);
        }
        if let Some(b) = runtime.sprite_batch.corner_buffer.take() {
            gl.delete_buffer(b);
        }
    }
}

/// Returns a shared reference to the package-private runtime.
pub fn get_gl_render_state_runtime(state: &GlRenderState) -> &GlRenderStateRuntime {
    &state.runtime
}

/// Returns a mutable reference to the package-private runtime.
pub fn get_gl_render_state_runtime_mut(state: &mut GlRenderState) -> &mut GlRenderStateRuntime {
    &mut state.runtime
}

// ---------------------------------------------------------------------------
// Byte-slice helpers — reinterpret packed GPU data for glow's `&[u8]` APIs.
// ---------------------------------------------------------------------------

/// Reinterprets a `u16` slice as raw little-endian bytes for buffer upload.
pub fn bytemuck_u16(data: &[u16]) -> &[u8] {
    // Safe: u16 has no padding and any bit pattern is valid as bytes.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

/// Reinterprets an `f32` slice as raw little-endian bytes for buffer upload.
pub fn bytemuck_f32(data: &[f32]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

/// Reinterprets a `u32` slice as raw little-endian bytes for buffer upload.
pub fn bytemuck_u32(data: &[u32]) -> &[u8] {
    // Safe: u32 has no padding and any bit pattern is valid as bytes.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    // bytemuck_f32

    #[test]
    fn bytemuck_f32_reinterprets_byte_length() {
        let data = [1.0_f32, 2.0, 3.0, 4.0];
        let bytes = bytemuck_f32(&data);
        assert_eq!(bytes.len(), 16);
        // 1.0_f32 little-endian is 0x3F800000.
        assert_eq!(&bytes[0..4], &[0x00, 0x00, 0x80, 0x3F]);
    }

    // bytemuck_u16

    #[test]
    fn bytemuck_u16_reinterprets_quad_indices() {
        let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];
        let bytes = bytemuck_u16(&indices);
        assert_eq!(bytes.len(), 12);
        assert_eq!(&bytes[0..2], &[0x00, 0x00]);
        assert_eq!(&bytes[2..4], &[0x01, 0x00]);
    }
}
