//! The bundled default quad material (TS `wgpuStandardMaterial.ts`): a textured quad with
//! per-instance alpha and no other effect. The batch holds no shader of its own, so even the plain
//! path is a registered material; a user can copy this module and register their own default.

use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render_wgpu::{
    WgpuQuadMaterialRenderer, WgpuRenderState, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, register_wgpu_quad_material_renderer,
};

use crate::wgpu_quad_batch_writer::get_wgpu_quad_batch_prelude_wgsl;

/// The standard material's batch renderer (TS `standardWgpuQuadMaterialRenderer`): no per-instance
/// material floats and the prelude-based textured-quad module, cached per device.
pub static STANDARD_WGPU_QUAD_MATERIAL_RENDERER: WgpuQuadMaterialRenderer =
    WgpuQuadMaterialRenderer {
        instance_float_count: 0,
        get_shader_module: get_standard_wgpu_material_shader_module,
        pack_instance: None,
    };

const STANDARD_MATERIAL_WGSL: &str = r"
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  return VertexOut(bv.position, bv.uv, bv.alpha);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color * clamp(in.alpha, 0.0, 1.0);
}
";

fn get_standard_wgpu_material_shader_module(state: &mut WgpuRenderState) -> wgpu::ShaderModule {
    let context = get_wgpu_render_state_runtime(state).context.clone();
    if let Some(cached) = &context.read().unwrap().standard_material_module {
        return cached.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(
                (get_wgpu_quad_batch_prelude_wgsl() + STANDARD_MATERIAL_WGSL).into(),
            ),
        });
    context.write().unwrap().standard_material_module = Some(module.clone());
    return module;
}

/// Registers the bundled default material under `STANDARD_MATERIAL_KIND` (TS
/// `registerWgpuStandardMaterial`). It has no privileged status in the render path: a node with no
/// material renders only if a renderer is registered for the standard kind.
pub fn register_wgpu_standard_material(state: &mut WgpuRenderState) {
    register_wgpu_quad_material_renderer(
        state,
        STANDARD_MATERIAL_KIND.to_string(),
        STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone(),
    );
}
