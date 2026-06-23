//! StandardPbr uber-shader pipeline compilation + per-state cache.
//!
//! A [`WgpuPbrPipeline`] is a compiled StandardPbr uber-shader variant plus the
//! bind-group layouts its bind groups target — the WGSL mirror of `GlPbrProgram`.
//! One exists per distinct (define key + color-attachment format) pair: a wgpu
//! render pipeline bakes both the feature flags and its color target format, so
//! an HDR rgba16float effect target and the bgra8unorm canvas need separate
//! variants. Built once and cached on the threaded scene runtime.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuPbrPipelineCache.ts`. The `cache_key` helper
//! is fully portable and faithful to TS (`${format}|${buildWgpuPbrDefineKey(key)}`).
//!
//! TS↔Rust divergence: the TS path fetches the pipeline cache off the state
//! (`getWgpuSceneRuntime(state).pipelineCache`); the Rust path threads the
//! caller-owned `WgpuSceneRuntime` (see `wgpu_scene_runtime`).

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_pbr_prelude::{
    WgpuPbrDefineKey, build_wgpu_pbr_define_key, get_wgpu_pbr_module_source_for_key,
};
use crate::wgpu_scene_runtime::WgpuSceneRuntime;

/// A compiled StandardPbr uber-shader variant plus the bind-group layouts its
/// bind groups target. One exists per distinct (define key + color-attachment
/// format) pair; the vertex attribute slots are fixed by the pipeline's vertex
/// layout (0 position, 1 normal, 2 tangent, 3 uv0), so they are not stored here.
///
/// Not `Clone` — wgpu's pipeline/layout handles are not `Clone` in this wgpu
/// version, so the scene runtime references the active pipeline by its cache key
/// (`WgpuSceneRuntime::active_pipeline_key`) rather than holding a copy.
pub struct WgpuPbrPipeline {
    pub draw_bind_group_layout: wgpu::BindGroupLayout,
    pub frame_bind_group_layout: wgpu::BindGroupLayout,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
}

/// The stable cache key for a StandardPbr pipeline variant: the color-attachment
/// format joined to the define key's stable string, mirroring TS
/// `${format}|${buildWgpuPbrDefineKey(key)}`. Pure string assembly — no GPU,
/// faithfully ported and unit-tested.
pub fn build_wgpu_pbr_pipeline_cache_key(
    format: wgpu::TextureFormat,
    key: &WgpuPbrDefineKey,
) -> String {
    format!("{format:?}|{}", build_wgpu_pbr_define_key(key))
}

/// Compiles the StandardPbr uber-shader module for a define key and builds the
/// render pipeline + its bind-group layouts for the given color-attachment
/// format. Pure GPU work — no caching.
///
/// Builds the three bind-group layouts (frame/draw/material), the pipeline layout,
/// the Depth24PlusStencil8 depth-stencil (compare `less`, depth write on), the
/// fixed 48-byte vertex layout (position/normal/tangent/uv0), and culls back-face
/// unless `key.double_sided`. Mirrors TS `compileWgpuPbrPipeline`.
pub fn compile_wgpu_pbr_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuPbrPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-pbr-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_pbr_module_source_for_key(key).into()),
    });

    // group(0) Frame: viewProjection + cameraPosition + packed light block.
    let frame_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-pbr-frame-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

    // group(1) Draw: world + normalMatrix, dynamic-offset uniform from the ring.
    let draw_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-pbr-draw-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

    // group(2) Material: MaterialBlock uniform + filtering sampler + 5 maps. The
    // layout matches whether or not the variant samples maps (maps deferred on
    // wgpu — a placeholder fills every map slot).
    let mut material_entries = vec![
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        },
        wgpu::BindGroupLayoutEntry {
            binding: 1,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        },
    ];
    for binding in 2..7 {
        material_entries.push(wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        });
    }
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-pbr-material-bgl"),
            entries: &material_entries,
        });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-pbr-pipeline-layout"),
        bind_group_layouts: &[
            &frame_bind_group_layout,
            &draw_bind_group_layout,
            &material_bind_group_layout,
        ],
        push_constant_ranges: &[],
    });

    let cull_mode = if key.double_sided {
        None
    } else {
        Some(wgpu::Face::Back)
    };

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-pbr-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: "vs_main",
            buffers: &[PBR_VERTEX_LAYOUT],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH_STENCIL_FORMAT,
            depth_write_enabled: true,
            depth_compare: wgpu::CompareFunction::Less,
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });

    WgpuPbrPipeline {
        draw_bind_group_layout,
        frame_bind_group_layout,
        material_bind_group_layout,
        pipeline,
    }
}

/// Resolves the StandardPbr pipeline for a define key + color-attachment format,
/// compiling and caching it on first use on the scene runtime's pipeline cache
/// (keyed by [`build_wgpu_pbr_pipeline_cache_key`]). Mirrors TS
/// `ensureWgpuPbrPipeline`.
pub fn ensure_wgpu_pbr_pipeline<'a>(
    state: &mut WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
) -> &'a WgpuPbrPipeline {
    let cache_key = build_wgpu_pbr_pipeline_cache_key(format, key);
    if !scene.pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_pbr_pipeline(state, key, format);
        scene.pipeline_cache.insert(cache_key.clone(), pipeline);
    }
    &scene.pipeline_cache[&cache_key]
}

/// The depth-stencil format the scene pass uses, matching render-wgpu's
/// main-canvas / effect-target depth attachment.
pub const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

// The canonical 48-byte PBR vertex record: position (vec3), normal (vec3),
// tangent (vec4), uv0 (vec2). Fixed on the pipeline; the upload binds the same
// record. Matches scene-gl's `gl_pbr_attribute_location` slot order.
const PBR_VERTEX_LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
    array_stride: 48,
    step_mode: wgpu::VertexStepMode::Vertex,
    attributes: &[
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x3,
            offset: 0,
            shader_location: 0,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x3,
            offset: 12,
            shader_location: 1,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 24,
            shader_location: 2,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 40,
            shader_location: 3,
        },
    ],
};

#[cfg(test)]
mod tests {
    use super::*;

    mod build_wgpu_pbr_pipeline_cache_key {
        use super::*;

        #[test]
        fn joins_format_and_define_key() {
            // Mirrors the TS cache-key shape `${format}|${defineKey}`: distinct format
            // or defines produce distinct keys; identical pairs collide (cache soundness).
            let neutral = WgpuPbrDefineKey::default();
            let double_sided = WgpuPbrDefineKey {
                double_sided: true,
                ..Default::default()
            };

            let a = build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &neutral);
            let b = build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Bgra8Unorm, &neutral);
            let c =
                build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &double_sided);

            assert_ne!(a, b);
            assert_ne!(a, c);
            assert!(a.ends_with("----"));
            assert!(c.ends_with("-d--"));
            assert_eq!(
                a,
                build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &neutral)
            );
        }
    }

    // compile_wgpu_pbr_pipeline / ensure_wgpu_pbr_pipeline require a live wgpu
    // device, so they are validated functionally (the parity matrix at the `wgpu`
    // cell), matching `flighthq-render-wgpu`'s no-device test posture.
}
