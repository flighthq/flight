use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime_mut;

pub const SHADOW_DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

pub const SHADOW_DEPTH_WGSL: &str = r#"
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {
  var clip = draw.world * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
"#;

pub const SHADOW_DEPTH_INSTANCED_WGSL: &str = r#"
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(6) instance0 : vec4f,
  @location(7) instance1 : vec4f,
  @location(8) instance2 : vec4f,
  @location(9) instance3 : vec4f,
) -> @builtin(position) vec4f {
  let instanceModel = mat4x4f(instance0, instance1, instance2, instance3);
  var clip = draw.world * instanceModel * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
"#;

pub fn shadow_vertex_buffer_layouts() -> Vec<wgpu::VertexBufferLayout<'static>> {
    return vec![wgpu::VertexBufferLayout {
        array_stride: 48,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[wgpu::VertexAttribute {
            shader_location: 0,
            offset: 0,
            format: wgpu::VertexFormat::Float32x3,
        }],
    }];
}

pub fn destroy_wgpu_scene3d_shadow(state: &WgpuRenderState) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.shadow = None;
        rt.shadow_dummy_texture = None;
        rt.shadow_dummy_view = None;
        rt.shadow_uniform_buffer = None;
        rt.shadow_comparison_sampler = None;
        rt.shadow_depth_pipeline = None;
        rt.shadow_depth_instanced_pipeline = None;
        rt.shadow_depth_skinned_pipeline = None;
        rt.shadow_sample_bind_group = None;
        rt.shadow_sample_layout = None;
        rt.shadow_sample_view = None;
        rt.pbr_sample_bind_group = None;
        rt.pbr_sample_shadow_view = None;
    });
}

pub fn normalize_directional_shadow_pcf_radius(radius: f32, max_pcf_radius: f32) -> f32 {
    if !radius.is_finite() {
        return 0.0;
    }
    return radius.max(0.0).min(max_pcf_radius).floor();
}
