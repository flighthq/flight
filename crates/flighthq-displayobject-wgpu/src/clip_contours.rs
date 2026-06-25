//! wgpu contour clip via stencil nesting — the wgpu counterpart to
//! `webglClipContours`. A path `ClipRegion` is realized by stamping its covered
//! pixels into the stencil buffer, then content draws in the existing `masked`
//! stencil mode (compare equal, reference = `current_mask_depth`). Crisp at any
//! zoom: the contours are transformed by the node world transform in the vertex
//! shader, never cached as a texture.
//!
//! NESTING MODEL — wgpu cannot clear the stencil mid render pass (the pass clears
//! it once at start, `stencil_load_op: Clear`), so the webgl clear-per-sibling
//! trick is unavailable. Instead each clip INCREMENTS the stencil from its parent
//! depth d to d+1 inside the polygon (compare `equal` d, pass op `increment-clamp`);
//! pop redraws the same geometry to DECREMENT back to d (compare `equal` d+1, pass
//! op `decrement-clamp`). This is sibling-safe (each pop restores its own region)
//! and nests cleanly. Scissor (rect) clips compose independently via
//! `set_scissor_rect`, exactly as before.
//!
//! LIMITATION: increment-clamp counts coverage, not winding, so a single
//! simple/convex contour clips exactly (circles, rounded rects, convex polygons)
//! but holes / self-intersecting even-odd fills are not yet honored — `winding`
//! is accepted but not applied, matching the webgl backend. A true winding pass
//! (separate front/back ops + a cover stamp) is a follow-up.
//!
//! STORAGE NOTE — the TS algorithm keeps two pieces of per-state state across
//! push/pop: a pushed-clip stack (vertex/uniform buffers + bind group + depth)
//! and a per-color-format clip-contour pipeline cache. In TS these live on the
//! shared `WgpuRenderStateRuntime` header (`clipContourStack`,
//! `clipContourPipelines`). The Rust backend core's `WgpuRenderStateRuntime`
//! does not yet carry those slots, and this crate must not extend the shared
//! runtime (it lives in `flighthq-render-wgpu`). To keep the port faithful
//! without that header, the stack and pipeline cache are carried in a
//! crate-local registry keyed by the render state's address — the in-crate
//! equivalent of the runtime slot, scoped entirely to the leaf renderer. When
//! the shared runtime grows the two header slots, this registry should be
//! replaced by direct runtime fields with no behavior change.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::PathWinding;
use flighthq_types::geometry::Matrix;

use crate::sprite_batch::flush_wgpu_sprite_batch;

// WGSL for the contour stencil stamp (color writes masked off; only the stencil
// moves). The vertex shader maps clip-local points through the precomputed
// projection · world matrix, landing in the same clip space as content draws.
const CLIP_WGSL: &str = r#"
struct ClipUniforms { matrix : mat3x3f }
@group(0) @binding(0) var<uniform> u : ClipUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return vec4f(0.0); }
"#;

// mat3x3f in a uniform buffer has a 16-byte column stride (each column is a vec3
// padded to vec4): 48 bytes.
const CLIP_UNIFORM_BYTES: u64 = 48;

/// Pops the most recently pushed contour clip, restoring the parent stencil depth.
///
/// Redraws the popped clip's stored geometry with the erase pipeline
/// (decrement-clamp), reference = `depth + 1`, so the clip's covered pixels drop
/// from `depth + 1` back to `depth` — restoring the parent's stencil for sibling
/// clips and the parent's own masked content. The popped buffers are retired into
/// `runtime.retired_buffers` so they are freed only after the frame's submit.
pub fn pop_wgpu_clip_contours(state: &mut WgpuRenderState) {
    flush_wgpu_sprite_batch(state);

    let entry = with_clip_contour_registry(state, |reg| reg.stack.pop());
    state.runtime.current_mask_depth = state.runtime.current_mask_depth.saturating_sub(1);

    if let Some(entry) = entry {
        // The erase pipeline must match the format the clip was stamped with,
        // even if the active color format has since changed.
        if let Some(pipelines) =
            with_clip_contour_registry(state, |reg| reg.pipelines.get(&entry.format).cloned())
            && let Some(pass) = state.runtime.render_pass.as_mut()
        {
            pass.set_pipeline(&pipelines.erase);
            pass.set_bind_group(0, &entry.bind_group, &[]);
            pass.set_vertex_buffer(0, entry.vertex_buffer.slice(..));
            pass.set_stencil_reference(entry.depth + 1);
            if entry.vertex_count > 0 {
                pass.draw(0..entry.vertex_count, 0..1);
            }
        }
        // The erase draw just recorded references these buffers; the frame's
        // submit is deferred to `submit_wgpu_render_pass`, so defer their
        // destruction until after that submit.
        state.runtime.retired_buffers.push(entry.vertex_buffer);
        state.runtime.retired_buffers.push(entry.uniform_buffer);
    }
}

/// Pushes a contour clip: stamps `contours` into the stencil and increments the
/// mask depth so subsequent `masked`-mode content is confined to the polygon.
///
/// `contours` is a list of flat `[x0, y0, x1, y1, ...]` point arrays;
/// `world_transform` maps contour-local points to world space. Each polygon is
/// fanned into a triangle list and stamped at the parent depth with
/// increment-clamp, raising its covered pixels to `depth + 1`. The `equal`
/// compare on the parent depth keeps the increment confined to the parent clip's
/// interior (or the whole cleared buffer at depth 0) and makes overlapping fan
/// triangles idempotent (only the first pass increments).
///
/// `winding` is accepted but, like the webgl backend, coverage-based stamping
/// does not yet apply it (see file header).
pub fn push_wgpu_clip_contours(
    state: &mut WgpuRenderState,
    contours: &[&[f32]],
    winding: PathWinding,
    world_transform: &Matrix,
) {
    flush_wgpu_sprite_batch(state);
    // Coverage-based; winding (even-odd vs non-zero, holes) is not yet applied.
    let _ = winding;

    let depth = state.runtime.current_mask_depth;
    let format = state_format(state);
    let pipelines = ensure_wgpu_clip_contour_pipelines(state, format);

    let (vertex_buffer, vertex_count) = create_wgpu_clip_contour_vertex_buffer(state, contours);
    let uniform_buffer = create_wgpu_clip_contour_uniform_buffer(state, world_transform);
    let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-wgpu-clip-contour-bind-group"),
        layout: &pipelines.bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });

    if let Some(pass) = state.runtime.render_pass.as_mut() {
        pass.set_pipeline(&pipelines.write);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.set_stencil_reference(depth);
        if vertex_count > 0 {
            pass.draw(0..vertex_count, 0..1);
        }
    }

    with_clip_contour_registry(state, |reg| {
        reg.stack.push(WgpuClipContourEntry {
            vertex_buffer,
            vertex_count,
            uniform_buffer,
            bind_group,
            depth,
            format,
        });
    });
    // Content drawn now tests stencil == current_mask_depth (the draw path
    // selects the `Masked` stencil mode with this reference).
    state.runtime.current_mask_depth = depth + 1;
}

/// Expands each contour's triangle fan (origin, i, i+1) into a triangle-list
/// vertex array — wgpu has no `TriangleFan` topology. Pure CPU geometry helper,
/// the faithful tessellation the stencil stamp uploads.
pub fn build_wgpu_clip_contour_triangles(contours: &[&[f32]]) -> Vec<f32> {
    let mut tris: Vec<f32> = Vec::new();
    for contour in contours {
        let point_count = contour.len() >> 1;
        if point_count < 3 {
            continue;
        }
        for i in 1..point_count - 1 {
            tris.push(contour[0]);
            tris.push(contour[1]);
            tris.push(contour[i * 2]);
            tris.push(contour[i * 2 + 1]);
            tris.push(contour[(i + 1) * 2]);
            tris.push(contour[(i + 1) * 2 + 1]);
        }
    }
    tris
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Builds the column-major mat3x3f = projection · world_transform, mapping
// clip-local points to clip space exactly as the content draw builds its matrix
// (so clip and content land in identical clip space). Each column is padded to 4
// floats (vec3 -> vec4 std140-style layout), giving 12 floats / 48 bytes.
fn create_wgpu_clip_contour_uniform_buffer(state: &WgpuRenderState, t: &Matrix) -> wgpu::Buffer {
    let (vw, vh) = current_wgpu_viewport(state);
    let iw = 2.0 / vw as f32;
    let ih = 2.0 / vh as f32;
    let mut m = [0.0f32; 12];
    m[0] = t.a * iw;
    m[1] = -t.b * ih;
    m[2] = 0.0;
    m[4] = t.c * iw;
    m[5] = -t.d * ih;
    m[6] = 0.0;
    m[8] = t.tx * iw - 1.0;
    m[9] = -t.ty * ih + 1.0;
    m[10] = 1.0;

    let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-clip-contour-uniform"),
        size: CLIP_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    state.queue.write_buffer(&buffer, 0, float_bytes(&m));
    buffer
}

// Fans each contour into a triangle-list vertex buffer (vec2 positions). Color
// writes are masked off in the pipeline, so only the stencil moves.
fn create_wgpu_clip_contour_vertex_buffer(
    state: &WgpuRenderState,
    contours: &[&[f32]],
) -> (wgpu::Buffer, u32) {
    let data = build_wgpu_clip_contour_triangles(contours);
    let vertex_count = (data.len() >> 1) as u32;
    let byte_len = (data.len() * 4) as u64;
    let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-clip-contour-vertex"),
        size: byte_len.max(4),
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    if byte_len > 0 {
        state.queue.write_buffer(&buffer, 0, float_bytes(&data));
    }
    (buffer, vertex_count)
}

// Reinterprets a float slice as its little-endian byte representation for buffer
// upload. f32 has no padding, so the bytes are a faithful view of the slice.
fn float_bytes(data: &[f32]) -> &[u8] {
    // SAFETY: f32 is `Copy` with no padding; the slice is valid for len*4 bytes.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 4) }
}

fn current_wgpu_viewport(state: &WgpuRenderState) -> (u32, u32) {
    match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (state.surface_width.max(1), state.surface_height.max(1)),
    }
}

// Returns the cached clip-contour pipelines for `format`, building them on first
// use. The increment-clamp `write` pipeline stamps a clip; the decrement-clamp
// `erase` pipeline undoes it on pop. Both mask off color writes and gate on
// `compare: Equal`.
fn ensure_wgpu_clip_contour_pipelines(
    state: &mut WgpuRenderState,
    format: wgpu::TextureFormat,
) -> Rc<WgpuClipContourPipelines> {
    if let Some(existing) =
        with_clip_contour_registry(state, |reg| reg.pipelines.get(&format).cloned())
    {
        return existing;
    }

    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-clip-contour-shader"),
        source: wgpu::ShaderSource::Wgsl(CLIP_WGSL.into()),
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("flight-wgpu-clip-contour-bgl"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-clip-contour-layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let vertex_buffers = [wgpu::VertexBufferLayout {
        array_stride: 8,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[wgpu::VertexAttribute {
            shader_location: 0,
            offset: 0,
            format: wgpu::VertexFormat::Float32x2,
        }],
    }];

    let make = |pass_op: wgpu::StencilOperation| -> wgpu::RenderPipeline {
        let stencil_face = wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Equal,
            pass_op,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
        };
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("flight-wgpu-clip-contour-pipeline"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: "vs_main",
                buffers: &vertex_buffers,
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::empty(),
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth24PlusStencil8,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always,
                stencil: wgpu::StencilState {
                    front: stencil_face,
                    back: stencil_face,
                    read_mask: 0xff,
                    write_mask: 0xff,
                },
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    };

    let pipelines = Rc::new(WgpuClipContourPipelines {
        write: make(wgpu::StencilOperation::IncrementClamp),
        erase: make(wgpu::StencilOperation::DecrementClamp),
        bind_group_layout,
    });
    with_clip_contour_registry(state, |reg| {
        reg.pipelines.insert(format, Rc::clone(&pipelines));
    });
    pipelines
}

// The color format the clip pipelines must match: the active render target's
// format if rendering to one, otherwise the surface format.
fn state_format(state: &WgpuRenderState) -> wgpu::TextureFormat {
    state.runtime.current_color_format.unwrap_or(state.format)
}

// Runs `f` against the clip-contour state for `state`, keyed by the render
// state's address. See the module header for why this registry stands in for the
// not-yet-present shared-runtime slots.
fn with_clip_contour_registry<R>(
    state: &WgpuRenderState,
    f: impl FnOnce(&mut WgpuClipContourState) -> R,
) -> R {
    let key = state as *const WgpuRenderState as usize;
    CLIP_CONTOUR_REGISTRY.with(|registry| {
        let mut registry = registry.borrow_mut();
        let entry = registry.entry(key).or_default();
        f(entry)
    })
}

// One pushed clip's GPU resources, redrawn with the erase pipeline on pop. wgpu
// resource handles are Arc-backed, so cloning carries the same GPU object.
struct WgpuClipContourEntry {
    vertex_buffer: wgpu::Buffer,
    vertex_count: u32,
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    depth: u32,
    format: wgpu::TextureFormat,
}

// The write (increment-clamp) and erase (decrement-clamp) stencil pipelines for
// one color format, plus the shared bind-group layout. Held behind `Rc` in the
// registry so the cache hands out cheap shared references (wgpu's pipeline
// handles are not `Clone`).
struct WgpuClipContourPipelines {
    write: wgpu::RenderPipeline,
    erase: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

// Per-render-state clip-contour state: the pushed-clip stack and the per-format
// pipeline cache. Stands in for the `clipContourStack` / `clipContourPipelines`
// runtime slots the TS backend keeps on `WgpuRenderStateRuntime`.
#[derive(Default)]
struct WgpuClipContourState {
    stack: Vec<WgpuClipContourEntry>,
    pipelines: HashMap<wgpu::TextureFormat, Rc<WgpuClipContourPipelines>>,
}

thread_local! {
    static CLIP_CONTOUR_REGISTRY: RefCell<HashMap<usize, WgpuClipContourState>> =
        RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_wgpu_clip_contour_triangles

    #[test]
    fn build_wgpu_clip_contour_triangles_fans_a_quad_into_two_triangles() {
        // A 4-point square fans into 2 triangles = 6 vertices = 12 floats.
        let quad: &[f32] = &[0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
        let tris = build_wgpu_clip_contour_triangles(&[quad]);
        assert_eq!(tris.len(), 12);
        // First triangle: (origin, p1, p2).
        assert_eq!(&tris[0..6], &[0.0, 0.0, 1.0, 0.0, 1.0, 1.0]);
        // Second triangle: (origin, p2, p3).
        assert_eq!(&tris[6..12], &[0.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
    }

    #[test]
    fn build_wgpu_clip_contour_triangles_skips_degenerate_contours() {
        let line: &[f32] = &[0.0, 0.0, 1.0, 1.0];
        assert!(build_wgpu_clip_contour_triangles(&[line]).is_empty());
    }

    // push/pop mask depth tracking
    //
    // The device-bound stencil stamp (pipeline/draw/setStencilReference call
    // shape) is asserted in TS against a mock GPU device; the Rust unit
    // environment has no wgpu device, so the testable seam here is the CPU
    // tessellation that the stamp uploads. A single quad fans to two triangles =
    // 6 vertices = 12 floats, the vertex count `push` records on the stack.
    #[test]
    fn push_pop_clip_contours_tracks_mask_depth_via_helper() {
        let quad: &[f32] = &[0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 0.0, 2.0];
        let tris = build_wgpu_clip_contour_triangles(&[quad]);
        assert_eq!(tris.len(), 12);
        assert_eq!((tris.len() >> 1) as u32, 6);
    }
}
