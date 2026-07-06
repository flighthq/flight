//! WgpuRenderState — creation, runtime access, and teardown.

use crate::runtime_types::WgpuSpriteBatchRuntime;
use crate::shader::{UNIFORM_BYTE_SIZE, create_wgpu_bind_group_layouts, warm_wgpu_pipelines};

// Ring buffer: 4096 draw slots per frame. Stride is clamped to at least 256 by the spec.
const RING_SLOT_COUNT: u64 = 4096;

// ---------------------------------------------------------------------------
// WgpuRenderOptions
// ---------------------------------------------------------------------------

/// Options passed to `create_wgpu_render_state`.
#[derive(Clone, Debug)]
pub struct WgpuRenderOptions {
    /// GPU power preference hint. Default: `None` (no preference).
    pub power_preference: Option<wgpu::PowerPreference>,
    /// Swapchain texture format. Default: adapter-preferred format.
    pub format: Option<wgpu::TextureFormat>,
    /// Allow linear texture filtering. Default: `true`.
    pub image_smoothing_enabled: bool,
    /// Device pixel ratio for HiDPI scaling. Default: `1.0`.
    pub pixel_ratio: f32,
    /// Round pixel coordinates before rendering. Default: `false`.
    pub round_pixels: bool,
    /// Packed RGBA background color (`0xRRGGBBaa`). Default: `0`.
    pub background_color: Option<u32>,
}

impl Default for WgpuRenderOptions {
    fn default() -> Self {
        Self {
            power_preference: None,
            format: None,
            image_smoothing_enabled: true,
            pixel_ratio: 1.0,
            round_pixels: false,
            background_color: None,
        }
    }
}

// ---------------------------------------------------------------------------
// WgpuRenderTarget
// ---------------------------------------------------------------------------

/// An off-screen render target backed by a `wgpu::Texture`.
#[derive(Debug)]
pub struct WgpuRenderTarget {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub bind_group: wgpu::BindGroup,
    pub depth_stencil_texture: wgpu::Texture,
    pub depth_stencil_view: wgpu::TextureView,
    pub format: wgpu::TextureFormat,
    pub width: u32,
    pub height: u32,
}

// ---------------------------------------------------------------------------
// WgpuRenderStateRuntime
// ---------------------------------------------------------------------------

/// Package-private per-frame mutable wgpu state. Embedded in `WgpuRenderState`
/// and written every frame by the render path.
///
/// Not `Debug` — it owns trait objects (material renderers) that are not
/// printable, and `wgpu` resource handles whose debug output is not useful.
pub struct WgpuRenderStateRuntime {
    pub current_blend_mode: Option<flighthq_types::blend::BlendMode>,
    pub current_mask_depth: u32,
    pub mask_write_mode: bool,
    pub current_scissor_rect: Option<WgpuScissorRect>,
    pub scissor_stack: Vec<WgpuScissorRect>,
    pub render_target_viewport: Option<WgpuViewport>,
    pub render_target_stack: Vec<WgpuRenderTargetStackEntry>,
    pub current_color_format: Option<wgpu::TextureFormat>,

    // Uniform ring buffer
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_data: Vec<f32>,
    pub uniform_data_u32: Vec<u32>,
    pub uniform_offset: u64,
    pub uniform_stride: u64,
    pub uniform_bind_group: wgpu::BindGroup,
    pub matrix_array: [f32; 9],

    // Pipeline cache: key = "blendMode-stencilMode-format"
    pub pipeline_cache: std::collections::HashMap<String, wgpu::RenderPipeline>,
    pub linear_sampler: wgpu::Sampler,
    pub nearest_sampler: wgpu::Sampler,

    // Per-frame command encoder
    pub command_encoder: Option<wgpu::CommandEncoder>,
    pub render_pass: Option<wgpu::RenderPass<'static>>,
    pub canvas_texture_view: Option<wgpu::TextureView>,
    pub canvas_view_cleared: bool,

    // Host-supplied per-frame color target (a swapchain surface texture's view).
    // When set and frame capture is off, `render_wgpu_background` uses this as the
    // frame's color attachment so the live window shows the scene. The host sets
    // it before the frame and clears it (or replaces it) each frame; consumed in
    // place by `render_wgpu_background` so a single set covers one frame.
    pub frame_target_view: Option<wgpu::TextureView>,

    // Depth-stencil
    pub depth_stencil_texture: Option<wgpu::Texture>,
    pub depth_stencil_view: Option<wgpu::TextureView>,
    pub depth_stencil_width: u32,
    pub depth_stencil_height: u32,

    // Sprite batch
    pub sprite_batch: WgpuSpriteBatchRuntime,

    // Particle runtime
    pub particle_instance_buffer: Option<wgpu::Buffer>,
    pub particle_instance_data: Option<Vec<f32>>,
    pub particle_instance_capacity: u32,

    // Texture cache (image-id → GPU texture)
    // Using a HashMap keyed by u64 (hashed image source identity) as the Rust equivalent of WeakMap.
    pub texture_cache: std::collections::HashMap<u64, wgpu::Texture>,

    // Clip
    pub clip_forms: Vec<WgpuClipForm>,

    // Material renderer registry (material KindId → renderer).
    pub material_renderer_map: std::collections::HashMap<
        flighthq_types::kind::KindId,
        Box<dyn crate::material_registry::WgpuMaterialRenderer>,
    >,

    // Per-node custom shader bindings (render-proxy id → shader) and the default bitmap shader.
    pub shader_map: std::collections::HashMap<u64, crate::shader::WgpuBitmapShader>,
    pub default_bitmap_shader: Option<crate::shader::WgpuBitmapShader>,

    // Frame capture (opt-in offscreen readback for headless/software adapters).
    pub frame_capture_enabled: bool,
    pub frame_capture_texture: Option<wgpu::Texture>,
    pub frame_capture_view: Option<wgpu::TextureView>,
    pub frame_capture_buffer: Option<wgpu::Buffer>,
    pub frame_capture_width: u32,
    pub frame_capture_height: u32,

    // Retired buffers: freed after submit so command encoder references are gone.
    pub retired_buffers: Vec<wgpu::Buffer>,

    // Registered leaf renderers keyed by node kind (display object / sprite / bitmap).
    pub renderers: std::collections::HashMap<flighthq_types::kind::KindId, WgpuRendererSlot>,

    // Per-display-object render cache targets keyed by cache id.
    pub render_cache_targets: std::collections::HashMap<u64, WgpuRenderTarget>,

    // Per-kind velocity writers dispatched by the velocity pass.
    pub velocity_writers: std::collections::HashMap<
        flighthq_types::kind::KindId,
        Box<dyn crate::runtime_types::WgpuVelocityWriter>,
    >,

    // Registered text-input overlay hook (caret/selection over rich text).
    pub text_input_overlay: Option<crate::runtime_types::WgpuRichTextOverlay>,

    // Lazily-built velocity pipeline resources (rgba16float velocity pass).
    pub velocity_pipeline: Option<crate::runtime_types::WgpuVelocityPipeline>,

    // Solid-fill shape mesh path. The fill pipeline draws colored triangles
    // from a vec2 vertex buffer (keyed by blend/stencil/format like the bitmap
    // pipeline cache); the mesh cache holds uploaded, tessellated geometry per
    // shape node id, rebuilt when the node's content revision changes.
    pub shape_fill_pipeline_cache: std::collections::HashMap<String, wgpu::RenderPipeline>,
    pub shape_fill_mesh_cache:
        std::collections::HashMap<u64, crate::runtime_types::WgpuShapeMeshCacheEntry>,
}

/// Identifies which built-in renderer handles a node kind. Mirrors
/// `GlRendererSlot`: a small enum keeps the per-node dispatch in
/// `render_wgpu_display_object` a plain match rather than trait-object dispatch.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WgpuRendererSlot {
    Container,
    Bitmap,
    QuadBatch,
    Shape,
    Sprite,
}

/// Axis-aligned scissor rectangle in wgpu viewport coordinates.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuScissorRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Viewport dimensions for an off-screen render target pass.
#[derive(Copy, Clone, Debug, Default)]
pub struct WgpuViewport {
    pub width: u32,
    pub height: u32,
}

/// Records which hardware gate was used for each pushed clip layer.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WgpuClipForm {
    Rect,
    Contour,
}

/// Saved per-render-target state pushed onto `render_target_stack`.
#[derive(Debug)]
pub struct WgpuRenderTargetStackEntry {
    pub canvas_texture_view: Option<wgpu::TextureView>,
    pub canvas_view_cleared: bool,
    pub depth_stencil_view: Option<wgpu::TextureView>,
    pub render_target_viewport: Option<WgpuViewport>,
    pub render_transform_2d: Option<flighthq_types::geometry::Matrix>,
    pub color_format: Option<wgpu::TextureFormat>,
}

// ---------------------------------------------------------------------------
// WgpuRenderState
// ---------------------------------------------------------------------------

/// Top-level state for a single wgpu 2D rendering context.
///
/// Owns the `wgpu::Device`, `wgpu::Queue`, canvas surface context, and all
/// per-state GPU resources (uniform ring buffer, samplers, pipeline cache).
/// Concrete renderer registrations are stored on the embedded `render_state`.
pub struct WgpuRenderState {
    /// Base backend-agnostic render settings.
    pub render_state: flighthq_render::RenderState,
    /// wgpu logical device.
    pub device: wgpu::Device,
    /// wgpu submission queue.
    pub queue: wgpu::Queue,
    /// Active swapchain format.
    pub format: wgpu::TextureFormat,
    /// Surface configuration width (pixels).
    pub surface_width: u32,
    /// Surface configuration height (pixels).
    pub surface_height: u32,
    /// Mutable per-frame render path state.
    ///
    /// Public so the per-subject leaf renderers in `flighthq-displayobject-wgpu`
    /// can read and write their runtime slots; treat as backend-internal.
    pub runtime: WgpuRenderStateRuntime,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Initialises a `WgpuRenderState` from an existing `wgpu::Device` and
/// `wgpu::Queue`, using `format` as the swapchain colour format.
///
/// The synchronous variant is provided for contexts where an async executor is
/// not available. For web targets use the async adapter request path and pass
/// the resolved `Device`/`Queue` here.
///
/// # Panics
/// Panics if required GPU resources cannot be allocated.
pub fn create_wgpu_render_state(
    device: wgpu::Device,
    queue: wgpu::Queue,
    format: wgpu::TextureFormat,
    surface_width: u32,
    surface_height: u32,
    options: &WgpuRenderOptions,
) -> WgpuRenderState {
    let mut render_state = flighthq_render::RenderState {
        allow_smoothing: options.image_smoothing_enabled,
        pixel_ratio: options.pixel_ratio,
        round_pixels: options.round_pixels,
        render_transform_2d: Some(flighthq_types::geometry::Matrix::default()),
        ..Default::default()
    };
    if let Some(color) = options.background_color {
        render_state.background_color = color;
    }

    let runtime = create_wgpu_render_state_runtime(&device, format, options);

    let mut state = WgpuRenderState {
        render_state,
        device,
        queue,
        format,
        surface_width,
        surface_height,
        runtime,
    };

    warm_wgpu_pipelines(&mut state);
    state
}

/// Allocates the package-private per-frame runtime for a `WgpuRenderState`,
/// including the uniform ring buffer, bind-group layouts, samplers, and the
/// shared uniform bind group.
pub fn create_wgpu_render_state_runtime(
    device: &wgpu::Device,
    _format: wgpu::TextureFormat,
    _options: &WgpuRenderOptions,
) -> WgpuRenderStateRuntime {
    let limits = device.limits();
    // Align ring slots to the device's minimum dynamic uniform offset alignment, clamped
    // to at least 256 and at least one full uniform slot.
    let uniform_stride = (limits.min_uniform_buffer_offset_alignment as u64)
        .max(256)
        .max(UNIFORM_BYTE_SIZE);
    let ring_byte_size = uniform_stride * RING_SLOT_COUNT;

    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-uniform-ring"),
        size: ring_byte_size,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let layouts = create_wgpu_bind_group_layouts(device);

    let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-wgpu-uniform-bind-group"),
        layout: &layouts.uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: wgpu::BufferSize::new(UNIFORM_BYTE_SIZE),
            }),
        }],
    });

    let linear_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("flight-wgpu-linear-sampler"),
        min_filter: wgpu::FilterMode::Linear,
        mag_filter: wgpu::FilterMode::Linear,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..Default::default()
    });

    let nearest_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("flight-wgpu-nearest-sampler"),
        min_filter: wgpu::FilterMode::Nearest,
        mag_filter: wgpu::FilterMode::Nearest,
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        ..Default::default()
    });

    let float_capacity = (ring_byte_size / 4) as usize;

    WgpuRenderStateRuntime {
        current_blend_mode: None,
        current_mask_depth: 0,
        mask_write_mode: false,
        current_scissor_rect: None,
        scissor_stack: Vec::new(),
        render_target_viewport: None,
        render_target_stack: Vec::new(),
        current_color_format: None,

        uniform_bind_group_layout: layouts.uniform_bind_group_layout,
        texture_bind_group_layout: layouts.texture_bind_group_layout,
        uniform_buffer,
        uniform_data: vec![0.0; float_capacity],
        uniform_data_u32: vec![0; float_capacity],
        uniform_offset: 0,
        uniform_stride,
        uniform_bind_group,
        matrix_array: [0.0; 9],

        pipeline_cache: std::collections::HashMap::new(),
        linear_sampler,
        nearest_sampler,

        command_encoder: None,
        render_pass: None,
        canvas_texture_view: None,
        canvas_view_cleared: false,
        frame_target_view: None,

        depth_stencil_texture: None,
        depth_stencil_view: None,
        depth_stencil_width: 0,
        depth_stencil_height: 0,

        sprite_batch: WgpuSpriteBatchRuntime::default(),

        particle_instance_buffer: None,
        particle_instance_data: None,
        particle_instance_capacity: 0,

        texture_cache: std::collections::HashMap::new(),

        clip_forms: Vec::new(),

        material_renderer_map: std::collections::HashMap::new(),

        shader_map: std::collections::HashMap::new(),
        default_bitmap_shader: None,

        frame_capture_enabled: false,
        frame_capture_texture: None,
        frame_capture_view: None,
        frame_capture_buffer: None,
        frame_capture_width: 0,
        frame_capture_height: 0,

        retired_buffers: Vec::new(),

        renderers: std::collections::HashMap::new(),
        render_cache_targets: std::collections::HashMap::new(),
        velocity_writers: std::collections::HashMap::new(),
        text_input_overlay: None,
        velocity_pipeline: None,

        shape_fill_pipeline_cache: std::collections::HashMap::new(),
        shape_fill_mesh_cache: std::collections::HashMap::new(),
    }
}

/// Frees the GPU resources allocated by `create_wgpu_render_state`: the
/// uniform buffer, particle instance buffer, depth-stencil texture, and
/// every sprite-batch pool slot.
///
/// The `wgpu::Device` is **not** destroyed — it is app-owned and may be shared.
/// GC-style wgpu objects with no `destroy()` (pipelines, bind groups, layouts,
/// samplers, shader modules, texture views) are released when the runtime drops.
pub fn destroy_wgpu_render_state(state: &mut WgpuRenderState) {
    state.runtime.uniform_buffer.destroy();
    if let Some(buffer) = state.runtime.particle_instance_buffer.take() {
        buffer.destroy();
    }
    if let Some(texture) = state.runtime.depth_stencil_texture.take() {
        texture.destroy();
    }
    for buffer in state.runtime.sprite_batch.buffer_pool.drain(..) {
        buffer.destroy();
    }
    for buffer in state.runtime.retired_buffers.drain(..) {
        buffer.destroy();
    }
    if let Some(texture) = state.runtime.frame_capture_texture.take() {
        texture.destroy();
    }
    if let Some(buffer) = state.runtime.frame_capture_buffer.take() {
        buffer.destroy();
    }
    let cache_targets: Vec<WgpuRenderTarget> = state
        .runtime
        .render_cache_targets
        .drain()
        .map(|(_, target)| target)
        .collect();
    for target in cache_targets {
        target.texture.destroy();
        target.depth_stencil_texture.destroy();
    }
    if let Some(pipeline) = state.runtime.velocity_pipeline.take() {
        pipeline.uniform_buffer.destroy();
    }
    let shape_meshes: Vec<crate::runtime_types::WgpuShapeMeshCacheEntry> = state
        .runtime
        .shape_fill_mesh_cache
        .drain()
        .map(|(_, entry)| entry)
        .collect();
    for entry in shape_meshes {
        for mesh in entry.meshes {
            mesh.vertex_buffer.destroy();
            mesh.index_buffer.destroy();
        }
    }
}

/// Returns a shared reference to the package-private runtime.
pub fn get_wgpu_render_state_runtime(state: &WgpuRenderState) -> &WgpuRenderStateRuntime {
    &state.runtime
}

/// Returns a mutable reference to the package-private runtime.
pub fn get_wgpu_render_state_runtime_mut(
    state: &mut WgpuRenderState,
) -> &mut WgpuRenderStateRuntime {
    &mut state.runtime
}

/// Returns `true` if wgpu / WebGPU is available in this environment.
pub fn is_wgpu_supported() -> bool {
    // wgpu is compiled in on every target Flight builds for (native + wasm32);
    // actual device availability is resolved later when an adapter is requested.
    true
}

#[cfg(test)]
mod tests {}
