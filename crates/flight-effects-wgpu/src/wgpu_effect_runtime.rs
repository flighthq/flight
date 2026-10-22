// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: crate-private per-state caches hold host-supplied wgpu resources
//! The per-render-state runtime effects-wgpu keeps in the state's `effect_runtime` slot (D15). It
//! replaces the source's module WeakMaps keyed by `WgpuRenderState`: the effect-pass
//! infrastructure, the program cache, each module's pipeline caches, the gradient ramps, the blend
//! backdrops and the diagnostics guards. A state derived later starts with an empty slot, exactly
//! as a fresh WeakMap key does.

use std::collections::HashMap;

use flight_entity::Ref;
use flight_render_wgpu::{
    WgpuNativeDevice, WgpuRenderState, WgpuTextureRenderTarget, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut,
};

use crate::types::*;

/// The effect-pass infrastructure of one state (TS `WgpuEffectPassState`): the uniform ring
/// buffer, the shared layouts and sampler, and the texture bind groups cached per view.
pub(crate) struct WgpuEffectPassState {
    pub(crate) uniform_buffer: wgpu::Buffer,
    pub(crate) uniform_data: Vec<f32>,
    pub(crate) uniform_offset: u32,
    pub(crate) uniform_stride: u32,
    pub(crate) uniform_slots: u32,
    pub(crate) uniform_bind_group_layout: wgpu::BindGroupLayout,
    pub(crate) uniform_bind_group: wgpu::BindGroup,
    pub(crate) texture_bind_group_layout: wgpu::BindGroupLayout,
    pub(crate) texture_bind_groups: HashMap<wgpu::TextureView, wgpu::BindGroup>,
    pub(crate) sampler: wgpu::Sampler,
    pub(crate) format: wgpu::TextureFormat,
}

/// Everything effects-wgpu caches for one render state.
#[derive(Default)]
pub(crate) struct WgpuEffectRuntime {
    pub(crate) pass_state: Option<WgpuEffectPassState>,
    // getWgpuEffectPipeline's per-state Map<string, WgpuEffectPipeline>.
    pub(crate) program_pipelines: HashMap<String, Ref<WgpuEffectPipeline>>,
    // The per-module WeakMap<WgpuRenderState, WgpuEffectPipeline> caches, keyed by module role.
    pub(crate) module_pipelines: HashMap<&'static str, Ref<WgpuEffectPipeline>>,
    // The per-module WeakMap<WgpuRenderState, Map<GPUTextureFormat, WgpuEffectPipeline>> caches.
    pub(crate) format_pipelines: HashMap<(&'static str, wgpu::TextureFormat), Ref<WgpuEffectPipeline>>,
    pub(crate) lut_bind_group_layout: Option<wgpu::BindGroupLayout>,
    pub(crate) ramp_textures: HashMap<String, wgpu::Texture>,
    pub(crate) blend_backdrops: HashMap<String, Ref<WgpuTextureRenderTarget>>,
    pub(crate) skip_guard: Option<WgpuEffectStateSkipGuard>,
    pub(crate) sample_count_guard: Option<WgpuEffectStateSampleCountGuard>,
    pub(crate) application_guard: Option<WgpuEffectApplicationGuard>,
    pub(crate) guards_enabled: bool,
}

/// A pipeline layout over the given bind-group layouts, in group order.
pub(crate) fn create_wgpu_effect_pipeline_layout(
    native: &WgpuNativeDevice,
    layouts: &[&wgpu::BindGroupLayout],
) -> wgpu::PipelineLayout {
    let layouts: Vec<Option<&wgpu::BindGroupLayout>> = layouts.iter().copied().map(Some).collect();
    return native
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &layouts,
            immediate_size: 0,
        });
}

/// Compiles and records a fullscreen effect render pipeline: the shared vertex entry `vs_main`,
/// the fragment entry `fs_main`, one color target of `format` with `blend`, no depth attachment.
pub(crate) fn create_wgpu_effect_render_pipeline(
    native: &WgpuNativeDevice,
    layout: &wgpu::PipelineLayout,
    module: &wgpu::ShaderModule,
    format: wgpu::TextureFormat,
    blend: wgpu::BlendState,
) -> wgpu::RenderPipeline {
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: Some(blend),
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(layout),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            depth_stencil: None,
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
    flight_render_wgpu::record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::CreateRenderPipeline(
            flight_render_wgpu::WgpuRenderPipelineRecord {
                depth_stencil: None,
                pipeline: pipeline.clone(),
                targets: targets.to_vec(),
            },
        );
    });
    return pipeline;
}

/// Compiles a WGSL module.
pub(crate) fn create_wgpu_effect_shader_module(
    native: &WgpuNativeDevice,
    code: &str,
) -> wgpu::ShaderModule {
    return native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(code.into()),
        });
}

/// Creates and records a texture + sampler bind group against `layout`.
pub(crate) fn create_wgpu_effect_texture_bind_group(
    native: &WgpuNativeDevice,
    layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    let bind_group = native
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
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
        });
    flight_render_wgpu::record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::CreateBindGroup(
            flight_render_wgpu::WgpuBindGroupRecord {
                bind_group: bind_group.clone(),
                views: vec![view.clone()],
            },
        );
    });
    return bind_group;
}

/// Records and issues the six-vertex fullscreen draw, then ends the pass.
pub(crate) fn draw_wgpu_effect_fullscreen_quad(
    native: &WgpuNativeDevice,
    mut pass: wgpu::RenderPass<'static>,
) {
    flight_render_wgpu::record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::Draw(flight_render_wgpu::WgpuDrawRecord {
            instance_count: 1,
            vertex_count: 6,
        });
    });
    pass.draw(0..6, 0..1);
    drop(pass);
}

/// Formats a number the way JS template strings print it (integers without a fraction).
pub(crate) fn format_wgpu_effect_number(value: f32) -> String {
    if value.is_finite() && value.fract() == 0.0 {
        return format!("{}", value as i64);
    }
    return format!("{value}");
}

/// The blend state of one effect blend mode (TS `getBlendState`).
pub(crate) fn get_wgpu_effect_blend_state(blend: WgpuEffectBlendMode) -> wgpu::BlendState {
    return match blend {
        WgpuEffectBlendMode::Replace => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::Zero,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::Zero,
                operation: wgpu::BlendOperation::Add,
            },
        },
        WgpuEffectBlendMode::Erase => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Zero,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Zero,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
        },
        WgpuEffectBlendMode::Premul => wgpu::BlendState {
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
}

/// The cached pipeline for one module role and destination format on this state, built on first
/// use (the source's per-module `Map<GPUTextureFormat, WgpuEffectPipeline>` caches).
pub(crate) fn get_wgpu_effect_format_pipeline(
    state: &mut WgpuRenderState,
    role: &'static str,
    format: wgpu::TextureFormat,
    build: impl FnOnce(&mut WgpuRenderState) -> WgpuEffectPipeline,
) -> Ref<WgpuEffectPipeline> {
    if let Some(existing) = get_wgpu_effect_runtime(state)
        .format_pipelines
        .get(&(role, format))
    {
        return existing.clone();
    }
    let pipeline: Ref<WgpuEffectPipeline> =
        std::sync::Arc::new(std::sync::RwLock::new(build(state)));
    get_wgpu_effect_runtime(state)
        .format_pipelines
        .insert((role, format), pipeline.clone());
    return pipeline;
}

/// The cached pipeline for one module role on this state, built on first use (the source's
/// per-module `WeakMap<WgpuRenderState, WgpuEffectPipeline>`).
pub(crate) fn get_wgpu_effect_module_pipeline(
    state: &mut WgpuRenderState,
    role: &'static str,
    build: impl FnOnce(&mut WgpuRenderState) -> WgpuEffectPipeline,
) -> Ref<WgpuEffectPipeline> {
    if let Some(existing) = get_wgpu_effect_runtime(state).module_pipelines.get(role) {
        return existing.clone();
    }
    let pipeline: Ref<WgpuEffectPipeline> =
        std::sync::Arc::new(std::sync::RwLock::new(build(state)));
    get_wgpu_effect_runtime(state)
        .module_pipelines
        .insert(role, pipeline.clone());
    return pipeline;
}

/// The state's effect runtime, created on first use.
pub(crate) fn get_wgpu_effect_runtime(state: &mut WgpuRenderState) -> &mut WgpuEffectRuntime {
    let slot = &mut get_wgpu_render_state_runtime_mut(state).effect_runtime;
    if slot
        .as_ref()
        .is_none_or(|value| !value.is::<WgpuEffectRuntime>())
    {
        *slot = Some(Box::new(WgpuEffectRuntime::default()));
    }
    return slot
        .as_mut()
        .and_then(|value| value.downcast_mut::<WgpuEffectRuntime>())
        .expect("the effect runtime slot holds a WgpuEffectRuntime");
}

/// The state's effect runtime when one was ever created; `None` reads as every cache empty.
pub(crate) fn peek_wgpu_effect_runtime(state: &WgpuRenderState) -> Option<&WgpuEffectRuntime> {
    return get_wgpu_render_state_runtime(state)
        .effect_runtime
        .as_ref()
        .and_then(|value| value.downcast_ref::<WgpuEffectRuntime>());
}

/// Records and sets a bind group on an open effect pass.
pub(crate) fn set_wgpu_effect_pass_bind_group(
    native: &WgpuNativeDevice,
    pass: &mut wgpu::RenderPass<'static>,
    index: u32,
    bind_group: &wgpu::BindGroup,
    offsets: &[u32],
) {
    flight_render_wgpu::record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::SetBindGroup(
            flight_render_wgpu::WgpuSetBindGroupRecord {
                bind_group: bind_group.clone(),
                index,
                offsets: offsets.to_vec(),
            },
        );
    });
    pass.set_bind_group(index, bind_group, offsets);
}

/// Records and sets a pipeline on an open effect pass.
pub(crate) fn set_wgpu_effect_pass_pipeline(
    native: &WgpuNativeDevice,
    pass: &mut wgpu::RenderPass<'static>,
    pipeline: &wgpu::RenderPipeline,
) {
    flight_render_wgpu::record_wgpu_command(native, || {
        return flight_render_wgpu::WgpuCommandRecord::SetPipeline(pipeline.clone());
    });
    pass.set_pipeline(pipeline);
}
