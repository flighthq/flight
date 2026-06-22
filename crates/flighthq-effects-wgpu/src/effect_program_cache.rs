//! Per-state cache of compiled effect filter pipelines, keyed by a stable
//! string, plus the self-contained fullscreen filter-pass primitive the effect
//! recipes draw with.
//!
//! Effect recipes call [`get_wgpu_effect_pipeline`] with their own key +
//! fragment WGSL so each pipeline compiles once per state and is reused every
//! frame.  The WGSL is the fragment half only; [`get_wgpu_effect_pipeline`]
//! prepends the shared fullscreen-triangle vertex.  Mirrors `flighthq-effects-gl`'s
//! `get_gl_effect_program` and the TS `getWebGPUEffectPipeline`.
//!
//! Uniform-slot convention every recipe follows: the fragment declares a
//! `Uniforms` struct at `@group(0) @binding(0)` and a `texture_2d<f32>` +
//! `sampler` pair at `@group(1)`, packing its scalars into the slots written by
//! the filter pass's `set_uniforms` callback.  Dual-source recipes bind a
//! second `texture_2d<f32>` + `sampler` at `@group(2)`.
//!
//! This crate does not route through `flighthq-filters-wgpu`: that crate carries
//! its own placeholder `WgpuRenderState`/`WgpuRenderTarget` (owned, non-`Clone`
//! `Device`/`Queue`) that cannot be bridged from a `flighthq-render-wgpu`
//! `WgpuRenderState`.  Until the two crates share one render-state type, the
//! fullscreen-pass primitive lives here, built directly on `wgpu` and the real
//! render-state's live command encoder.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_render_wgpu::render_state::{
    WgpuRenderState, WgpuRenderTarget, get_wgpu_render_state_runtime_mut,
};

/// Blend mode a cached effect pipeline composites with.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum WgpuEffectBlend {
    /// Overwrite the destination (most single-pass color recipes).
    #[default]
    Replace,
    /// Premultiplied-alpha over-composite (additive-style branches).
    Premultiplied,
}

/// A compiled fullscreen effect filter pipeline.
///
/// Holds a render pipeline per output color format (effect targets may be the
/// canvas format or an HDR `Rgba16Float` format), the dedicated uniform buffer
/// the recipe's `set_uniforms` callback writes, and the bind-group layouts the
/// pass binds.  `sources` is the number of input textures (1 single-source, 2
/// dual-source) so the pass binds the right number of source groups.
pub struct WgpuFilterPipeline {
    pub fragment_wgsl: String,
    pub blend: WgpuEffectBlend,
    pub sources: u32,
    pub uniform_buffer: wgpu::Buffer,
    pub uniform_bind_group: wgpu::BindGroup,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub texture_bind_group_layout: wgpu::BindGroupLayout,
    pub sampler: wgpu::Sampler,
    /// One pipeline per output color format, compiled lazily.
    pub variants: HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>,
}

/// Returns the compiled fullscreen filter pipeline for `key`, compiling it from
/// `fragment_wgsl` (with the given `blend`) on first call.  Subsequent calls
/// return the cached pipeline.
///
/// The pipeline is a single-source effect (one input texture at `@group(1)`).
/// Use [`get_wgpu_dual_source_effect_pipeline`] for recipes that read two
/// inputs (`@group(1)` + `@group(2)`).
pub fn get_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
) {
    ensure_wgpu_effect_pipeline(state, key, fragment_wgsl, blend, 1);
}

/// Returns the compiled dual-source fullscreen filter pipeline for `key`.
///
/// Binds two input textures: `source0` at `@group(1)`, `source1` at `@group(2)`.
pub fn get_wgpu_dual_source_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
) {
    ensure_wgpu_effect_pipeline(state, key, fragment_wgsl, blend, 2);
}

/// Compiles (if needed) and stores the pipeline for `key` in the per-state
/// cache, building a format variant for `state.format`.
pub fn ensure_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
    sources: u32,
) {
    let format = state.format;
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let per_state = cache.entry(state_id).or_default();
        let pipeline = match per_state.get_mut(key) {
            Some(p) => p,
            None => {
                let compiled =
                    build_wgpu_filter_pipeline(state, fragment_wgsl, blend, sources, format);
                per_state.entry(key.to_string()).or_insert(compiled)
            }
        };
        if !pipeline.variants.contains_key(&format) {
            let variant = build_wgpu_filter_pipeline_variant(
                state,
                &pipeline.fragment_wgsl,
                pipeline.blend,
                pipeline.sources,
                format,
                &pipeline.uniform_bind_group_layout,
                &pipeline.texture_bind_group_layout,
            );
            pipeline.variants.insert(format, variant);
        }
    });
}

/// Compiles (if needed) the pipeline variant for `output_format` on the already
/// cached pipeline for `key`, leaving the cache otherwise untouched.
///
/// Effect passes render into targets whose format may differ from `state.format`
/// (an HDR chain uses `Rgba16Float` scratch targets). The pipeline must carry a
/// variant matching each output format it is drawn into; this compiles a missing
/// one on demand. No-op when `key` is not yet cached (the caller compiles the
/// base pipeline first via `get_wgpu_effect_pipeline`).
pub fn ensure_wgpu_effect_pipeline_variant(
    state: &WgpuRenderState,
    key: &str,
    output_format: wgpu::TextureFormat,
) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let Some(per_state) = cache.get_mut(&state_id) else {
            return;
        };
        let Some(pipeline) = per_state.get_mut(key) else {
            return;
        };
        if pipeline.variants.contains_key(&output_format) {
            return;
        }
        let variant = build_wgpu_filter_pipeline_variant(
            state,
            &pipeline.fragment_wgsl,
            pipeline.blend,
            pipeline.sources,
            output_format,
            &pipeline.uniform_bind_group_layout,
            &pipeline.texture_bind_group_layout,
        );
        pipeline.variants.insert(output_format, variant);
    });
}

/// Draws a fullscreen single-source filter pass: reads `source` (`@group(1)`),
/// writes `dest` (or the canvas when `None`), running the cached pipeline for
/// `key`.  `set_uniforms` fills the recipe's uniform slots (a `[f32; 32]` and an
/// `[i32; 32]` view sharing one 128-byte block) before the draw.
pub fn draw_wgpu_effect_filter_pass(
    state: &mut WgpuRenderState,
    key: &str,
    source: &WgpuRenderTarget,
    dest: Option<&WgpuRenderTarget>,
    set_uniforms: impl FnOnce(&mut [f32; 32], &mut [i32; 32]),
) {
    let mut floats = [0.0f32; 32];
    let mut ints = [0i32; 32];
    set_uniforms(&mut floats, &mut ints);

    let format = dest.map(|d| d.format).unwrap_or(state.format);
    let state_id = state as *const _ as usize;

    // The output format of a pass is the dest target's format (or the canvas
    // format when presenting). It may differ from `state.format` — an HDR effect
    // chain writes `Rgba16Float` scratch targets — so the per-format pipeline
    // variant must be compiled for the dest format before the lookup, not only
    // for `state.format`. Without this, a draw into an HDR target finds no
    // variant and is silently skipped, leaving the target empty.
    ensure_wgpu_effect_pipeline_variant(state, key, format);

    CACHE.with(|cache| {
        let cache = cache.borrow();
        let Some(per_state) = cache.get(&state_id) else {
            return;
        };
        let Some(pipeline) = per_state.get(key) else {
            return;
        };
        let Some(render_pipeline) = pipeline.variants.get(&format) else {
            return;
        };

        // Upload the recipe uniforms into the pipeline's dedicated buffer. The
        // i32 view aliases the same 128-byte block, so writing ints overwrites
        // the matching float slot — recipes use one or the other per slot.
        let mut bytes = bytemuck_floats(&floats);
        overlay_ints(&mut bytes, &ints);
        state
            .queue
            .write_buffer(&pipeline.uniform_buffer, 0, &bytes);

        let source_bind_groups = [build_source_bind_group(
            state,
            &pipeline.texture_bind_group_layout,
            &pipeline.sampler,
            &source.view,
        )];

        run_wgpu_effect_pass(
            state,
            render_pipeline,
            &pipeline.uniform_bind_group,
            &source_bind_groups,
            dest,
        );
    });
}

/// Draws a fullscreen dual-source filter pass: reads `source0` (`@group(1)`)
/// and `source1` (`@group(2)`), writes `dest` (or the canvas when `None`).
pub fn draw_wgpu_dual_source_effect_pass(
    state: &mut WgpuRenderState,
    key: &str,
    source0: &WgpuRenderTarget,
    source1_view: &wgpu::TextureView,
    dest: Option<&WgpuRenderTarget>,
    set_uniforms: impl FnOnce(&mut [f32; 32], &mut [i32; 32]),
) {
    let mut floats = [0.0f32; 32];
    let mut ints = [0i32; 32];
    set_uniforms(&mut floats, &mut ints);

    let format = dest.map(|d| d.format).unwrap_or(state.format);
    let state_id = state as *const _ as usize;

    // See `draw_wgpu_effect_filter_pass`: compile the variant for the dest format
    // (HDR targets differ from `state.format`) before the lookup.
    ensure_wgpu_effect_pipeline_variant(state, key, format);

    CACHE.with(|cache| {
        let cache = cache.borrow();
        let Some(per_state) = cache.get(&state_id) else {
            return;
        };
        let Some(pipeline) = per_state.get(key) else {
            return;
        };
        let Some(render_pipeline) = pipeline.variants.get(&format) else {
            return;
        };

        let mut bytes = bytemuck_floats(&floats);
        overlay_ints(&mut bytes, &ints);
        state
            .queue
            .write_buffer(&pipeline.uniform_buffer, 0, &bytes);

        let source_bind_groups = [
            build_source_bind_group(
                state,
                &pipeline.texture_bind_group_layout,
                &pipeline.sampler,
                &source0.view,
            ),
            build_source_bind_group(
                state,
                &pipeline.texture_bind_group_layout,
                &pipeline.sampler,
                source1_view,
            ),
        ];

        run_wgpu_effect_pass(
            state,
            render_pipeline,
            &pipeline.uniform_bind_group,
            &source_bind_groups,
            dest,
        );
    });
}

/// Drops every cached effect filter pipeline compiled for `state`.
///
/// The cache is keyed by the state's pointer identity, so a state that is torn
/// down must clear its entry before its memory can be reused by a later state at
/// the same address — otherwise the new state would dispatch against pipelines
/// and uniform buffers owned by the dropped state's (freed) device. Call this as
/// part of tearing a state down, after its final submit.
pub fn clear_wgpu_effect_pipeline_cache(state: &WgpuRenderState) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        cache.borrow_mut().remove(&state_id);
    });
}

/// Builds the full WGSL module: a fullscreen-triangle vertex stage emitting a
/// `uv` varying at `@location(0)`, followed by the recipe's fragment source.
pub fn build_wgpu_effect_module_wgsl(fragment_wgsl: &str) -> String {
    let mut wgsl = String::with_capacity(EFFECT_VERTEX_WGSL.len() + fragment_wgsl.len());
    wgsl.push_str(EFFECT_VERTEX_WGSL);
    wgsl.push('\n');
    wgsl.push_str(fragment_wgsl);
    wgsl
}

fn build_wgpu_filter_pipeline(
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
    sources: u32,
    format: wgpu::TextureFormat,
) -> WgpuFilterPipeline {
    let device = &state.device;

    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-effect-uniform-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: wgpu::BufferSize::new(EFFECT_UNIFORM_BYTE_SIZE),
                },
                count: None,
            }],
        });

    let texture_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-effect-texture-bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-effect-uniform-buffer"),
        size: EFFECT_UNIFORM_BYTE_SIZE,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-effect-uniform-bind-group"),
        layout: &uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });

    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("flight-effect-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::FilterMode::Nearest,
        ..Default::default()
    });

    let variant = build_wgpu_filter_pipeline_variant(
        state,
        fragment_wgsl,
        blend,
        sources,
        format,
        &uniform_bind_group_layout,
        &texture_bind_group_layout,
    );
    let mut variants = HashMap::new();
    variants.insert(format, variant);

    WgpuFilterPipeline {
        fragment_wgsl: fragment_wgsl.to_string(),
        blend,
        sources,
        uniform_buffer,
        uniform_bind_group,
        uniform_bind_group_layout,
        texture_bind_group_layout,
        sampler,
        variants,
    }
}

#[allow(clippy::too_many_arguments)]
fn build_wgpu_filter_pipeline_variant(
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
    sources: u32,
    format: wgpu::TextureFormat,
    uniform_bind_group_layout: &wgpu::BindGroupLayout,
    texture_bind_group_layout: &wgpu::BindGroupLayout,
) -> wgpu::RenderPipeline {
    let device = &state.device;

    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-effect-shader"),
        source: wgpu::ShaderSource::Wgsl(build_wgpu_effect_module_wgsl(fragment_wgsl).into()),
    });

    // group(0) = uniforms; group(1..=sources) = a texture+sampler pair each.
    let mut layouts: Vec<&wgpu::BindGroupLayout> = Vec::with_capacity(1 + sources as usize);
    layouts.push(uniform_bind_group_layout);
    for _ in 0..sources {
        layouts.push(texture_bind_group_layout);
    }

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-effect-pipeline-layout"),
        bind_group_layouts: &layouts,
        push_constant_ranges: &[],
    });

    let blend_state = match blend {
        WgpuEffectBlend::Replace => wgpu::BlendState::REPLACE,
        WgpuEffectBlend::Premultiplied => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
        },
    };

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-effect-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(blend_state),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn build_source_bind_group(
    state: &WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    view: &wgpu::TextureView,
) -> wgpu::BindGroup {
    state.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-effect-source-bind-group"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

/// Encodes the fullscreen draw into a fresh render pass on the live command
/// encoder, targeting `dest` (or the canvas view when `None`).  The pass loads
/// nothing and stores the rendered fullscreen triangle.
fn run_wgpu_effect_pass(
    state: &mut WgpuRenderState,
    pipeline: &wgpu::RenderPipeline,
    uniform_bind_group: &wgpu::BindGroup,
    source_bind_groups: &[wgpu::BindGroup],
    dest: Option<&WgpuRenderTarget>,
) {
    let runtime = get_wgpu_render_state_runtime_mut(state);

    // Close any pass that is open so a fresh single-pass encode can run; the
    // pipeline's begin/end target machinery reopens the enclosing pass after.
    if let Some(pass) = runtime.render_pass.take() {
        drop(pass);
    }

    let dest_view = match dest {
        Some(target) => &target.view,
        None => match runtime.canvas_texture_view.as_ref() {
            Some(view) => view,
            None => return,
        },
    };

    let Some(encoder) = runtime.command_encoder.as_mut() else {
        return;
    };

    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("flight-effect-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: dest_view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Load,
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, uniform_bind_group, &[]);
    for (i, bind_group) in source_bind_groups.iter().enumerate() {
        pass.set_bind_group(1 + i as u32, bind_group, &[]);
    }
    pass.draw(0..3, 0..1);
}

fn bytemuck_floats(floats: &[f32; 32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(EFFECT_UNIFORM_BYTE_SIZE as usize);
    for f in floats {
        bytes.extend_from_slice(&f.to_ne_bytes());
    }
    bytes
}

// Overlays any non-zero i32 slot onto the byte buffer in the matching position;
// recipes write either a float or an int into a given slot, never both.
fn overlay_ints(bytes: &mut [u8], ints: &[i32; 32]) {
    for (i, v) in ints.iter().enumerate() {
        if *v != 0 {
            let off = i * 4;
            bytes[off..off + 4].copy_from_slice(&v.to_ne_bytes());
        }
    }
}

// 32 f32 slots = 128 bytes; matches the recipe `set_uniforms` slot views and
// satisfies the 256-byte uniform minimum is not required because no dynamic
// offset is used (each effect pipeline has its own buffer at offset 0).
const EFFECT_UNIFORM_BYTE_SIZE: u64 = 128;

// Fullscreen-triangle vertex stage: three clip-space vertices covering the
// viewport, emitting a `uv` in [0,1] at `@location(0)`. Y is flipped so the
// sampled texture is upright (render-target textures store top-left origin).
const EFFECT_VERTEX_WGSL: &str = /* wgsl */
    r#"
struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0),
  );
  var out : VertexOutput;
  out.position = vec4f(positions[vertex_index], 0.0, 1.0);
  out.uv = uvs[vertex_index];
  return out;
}
"#;

thread_local! {
    // Per-state pipeline cache keyed by state pointer identity (the Rust analog
    // of the TS WeakMap<WebGPURenderState, ...>). Holds non-Send wgpu objects,
    // so a thread_local is the correct home (thread-confined, no Send bound).
    static CACHE: RefCell<HashMap<usize, HashMap<String, WgpuFilterPipeline>>> =
        RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clear_wgpu_effect_pipeline_cache_removes_state_entry() {
        // GPU-guarded: build a real state only when an adapter exists. Compiling
        // a pipeline populates the per-state cache; clearing must remove the
        // state's entry so a reused state address inherits no stale pipelines.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.passthrough";
        let fragment = "@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }";
        get_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace);
        let state_id = &state as *const _ as usize;
        assert!(CACHE.with(|c| c.borrow().contains_key(&state_id)));
        clear_wgpu_effect_pipeline_cache(&state);
        assert!(!CACHE.with(|c| c.borrow().contains_key(&state_id)));
    }

    #[test]
    fn ensure_wgpu_effect_pipeline_variant_compiles_a_new_output_format() {
        // GPU-guarded: a base pipeline compiles its `state.format` variant; a
        // draw into a differently formatted target (an HDR `Rgba16Float` scratch)
        // needs that format's variant. `ensure_wgpu_effect_pipeline_variant`
        // compiles it on demand so the variant lookup at draw time succeeds.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.variant";
        let fragment = "@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }";
        get_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace);
        let state_id = &state as *const _ as usize;
        // The HDR format is not the base (canvas) format, so its variant is absent.
        let hdr = wgpu::TextureFormat::Rgba16Float;
        assert!(CACHE.with(|c| {
            let c = c.borrow();
            !c[&state_id][key].variants.contains_key(&hdr)
        }));
        ensure_wgpu_effect_pipeline_variant(&state, key, hdr);
        assert!(CACHE.with(|c| {
            let c = c.borrow();
            c[&state_id][key].variants.contains_key(&hdr)
        }));
        clear_wgpu_effect_pipeline_cache(&state);
    }

    #[test]
    fn build_wgpu_effect_module_wgsl_prepends_vertex_stage() {
        let fragment = "@fragment\nfn fs_main() -> @location(0) vec4f { return vec4f(1.0); }";
        let module = build_wgpu_effect_module_wgsl(fragment);
        // The fullscreen-triangle vertex entry point is prepended.
        assert!(module.contains("fn vs_main"));
        assert!(module.contains("@builtin(vertex_index)"));
        // The recipe fragment is preserved verbatim after the vertex stage.
        assert!(module.contains("fn fs_main"));
        assert!(module.find("fn vs_main").unwrap() < module.find("fn fs_main").unwrap());
    }

    #[test]
    fn overlay_ints_writes_only_nonzero_slots() {
        let floats = [1.5f32; 32];
        let mut bytes = bytemuck_floats(&floats);
        let mut ints = [0i32; 32];
        ints[3] = 7;
        overlay_ints(&mut bytes, &ints);
        // Slot 3 now holds the int 7; slot 0 still holds the float 1.5.
        let slot3 = i32::from_ne_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
        let slot0 = f32::from_ne_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        assert_eq!(slot3, 7);
        assert_eq!(slot0, 1.5);
    }

    #[test]
    fn bytemuck_floats_packs_thirty_two_slots() {
        let floats = [2.0f32; 32];
        let bytes = bytemuck_floats(&floats);
        assert_eq!(bytes.len(), EFFECT_UNIFORM_BYTE_SIZE as usize);
        let slot0 = f32::from_ne_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        assert_eq!(slot0, 2.0);
    }
}
