//! The Wgpu wireframe prelude — the WGSL mirror of scene-gl's `glWireframePrelude`.
//! A minimal module that reuses the shared `vs_main` and outputs a single flat LINE
//! color; the pipeline is built with line-list topology and cull-none. One variant
//! per color format — group(2) carries only the color uniform.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuWireframePrelude.ts`.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// A compiled wireframe pipeline.
pub type WgpuWireframePipeline = WgpuMeshPipeline;

/// Ensures (once per material kind) the wireframe color bind group — a single
/// uniform buffer — and rewrites it with this material's linear line color. Mirrors
/// TS `bindWgpuWireframeColor` (keyed by kind + threaded runtime + `cache_key`
/// layout lookup).
pub fn bind_wgpu_wireframe_color(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    material_key: flighthq_types::kind::KindId,
    color: &[f32; 4],
) {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-wireframe-material-uniform"),
            size: WIREFRAME_UNIFORM_BYTES,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let bind_group = {
            let layout = &scene.mesh_pipeline_cache[cache_key].material_bind_group_layout;
            state.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("flight-wgpu-wireframe-material-bind-group"),
                layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                }],
            })
        };
        scene
            .material_bind_groups
            .insert(material_key, WgpuMaterialBinding { bind_group, buffer });
    }

    let binding = &scene.material_bind_groups[&material_key];
    let scratch = [color[0], color[1], color[2], color[3]];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
}

/// Compiles the wireframe module and builds the line-list render pipeline for the
/// color format, with a group(2) material layout carrying just the color uniform.
/// Cull-none (lines have no winding). Mirrors TS `compileWgpuWireframePipeline`.
pub fn compile_wgpu_wireframe_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    format: wgpu::TextureFormat,
) -> WgpuWireframePipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-wireframe-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_wireframe_module_source().into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-wireframe-material-bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
    create_wgpu_mesh_pipeline(
        state,
        scene,
        CreateWgpuMeshPipelineOptions {
            double_sided: true,
            format,
            material_bind_group_layout,
            module,
            topology: wgpu::PrimitiveTopology::LineList,
        },
    )
}

/// Resolves the wireframe pipeline for a color format, compiling and caching it on
/// first use, and returns its `mesh_pipeline_cache` key. Mirrors TS
/// `ensureWgpuWireframePipeline` (returns the string key — see
/// `ensure_wgpu_classic_pipeline`).
pub fn ensure_wgpu_wireframe_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    format: wgpu::TextureFormat,
) -> String {
    let cache_key = format!("wireframe:{format:?}");
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_wireframe_pipeline(state, scene, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    cache_key
}

/// The full WGSL module source.
pub fn get_wgpu_wireframe_module_source() -> String {
    format!("{}{}", WGPU_MESH_PRELUDE_WGSL, WIREFRAME_WGSL_BODY)
}

const WIREFRAME_UNIFORM_BYTES: u64 = 16;

const WIREFRAME_WGSL_BODY: &str = r#"
struct WireframeMaterial {
  color : vec4f,  // linear rgba
};

@group(2) @binding(0) var<uniform> material : WireframeMaterial;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  return material.color;
}
"#;

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod get_wgpu_wireframe_module_source {
        use super::*;

        #[test]
        fn appends_the_flat_color_body_to_the_shared_prelude() {
            let source = get_wgpu_wireframe_module_source();
            assert!(source.contains("fn vs_main"));
            assert!(source.contains("struct WireframeMaterial"));
            assert!(source.contains("return material.color;"));
        }
    }
}
