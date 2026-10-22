use std::sync::Arc;

use flight_camera::Camera3D;
use flight_materials::{
    CustomShaderMaterial, Material3D, UniformValue, CUSTOM_SHADER_MATERIAL_KIND,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, compile_gl_mesh_program, ensure_gl_scene3d_program,
    set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::{GlCustomMaterialShaderSource, GlMeshMaterialRenderer, GlMeshProgram, Scene3DLightBlock};

pub struct GlCustomShaderMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlCustomShaderMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let custom = material.as_any().downcast_ref::<CustomShaderMaterial>();
        let custom = match custom {
            Some(c) if !c.shader_key.is_empty() => c,
            _ => {
                get_gl_scene3d_runtime_mut(state, |rt| {
                    rt.active_mesh_program = None;
                });
                return;
            }
        };

        let source = get_gl_scene3d_runtime(state, |rt| {
            rt.program_cache
                .get(&format!("custom_source:{}", custom.shader_key))
                .and_then(|v| v.downcast_ref::<GlCustomMaterialShaderSource>().cloned())
        });
        let source = match source {
            Some(s) => s,
            None => {
                get_gl_scene3d_runtime_mut(state, |rt| {
                    rt.active_mesh_program = None;
                });
                return;
            }
        };

        let cache_key = format!("custom:{}", custom.shader_key);
        let program: GlMeshProgram = ensure_gl_scene3d_program(state, &cache_key, |gl| {
            let linked =
                compile_gl_mesh_program(gl, &source.vertex_source, &source.fragment_source)
                    .expect("custom shader program");
            unsafe {
                GlMeshProgram {
                    program: linked,
                    model_location: gl.get_uniform_location(linked, "u_model"),
                    view_projection_location: gl.get_uniform_location(
                        linked,
                        "u_viewProjection",
                    ),
                    normal_matrix_location: gl.get_uniform_location(linked, "u_normalMatrix"),
                    camera_position_location: gl.get_uniform_location(
                        linked,
                        "u_cameraPosition",
                    ),
                    object_alpha_location: gl.get_uniform_location(linked, "u_objectAlpha"),
                    alpha_is_coverage_location: gl.get_uniform_location(
                        linked,
                        "u_alphaIsCoverage",
                    ),
                }
            }
        });

        if let Some(guard) = get_gl_scene3d_runtime(state, |rt| rt.custom_shader_guard.clone()) {
            guard(state, program.program, &custom.shader_key);
        }

        begin_gl_mesh_draw(state, &program, custom.material3d_fields().double_sided);
        set_gl_mesh_view_projection(state, program.view_projection_location.clone(), camera);
        set_gl_mesh_camera_position(
            &state.gl,
            program.camera_position_location.clone(),
            camera,
        );

        upload_custom_uniforms(&state.gl, program.program, custom);
        upload_custom_textures(state, program.program, custom);
    }

    fn draw(
        &self,
        state: &GlRenderState,
        _proxy: &RenderProxy<GlRenderState>,
        _geometry: &MeshGeometry,
    ) {
        let active = get_gl_scene3d_runtime(state, |rt| rt.active_mesh_program);
        if active.is_none() {
            return;
        }
    }
}

fn upload_custom_uniforms(
    gl: &glow::Context,
    program: glow::NativeProgram,
    material: &CustomShaderMaterial,
) {
    let uniforms = match &material.uniforms {
        Some(u) => u,
        None => return,
    };
    for (name, value) in uniforms {
        let location = unsafe { gl.get_uniform_location(program, name) };
        if location.is_none() {
            continue;
        }
        unsafe {
            match value {
                UniformValue::Scalar(v) => {
                    gl.uniform_1_f32(location.as_ref(), *v);
                }
                UniformValue::Array(arr) => match arr.len() {
                    1 => gl.uniform_1_f32(location.as_ref(), arr[0]),
                    2 => gl.uniform_2_f32(location.as_ref(), arr[0], arr[1]),
                    3 => gl.uniform_3_f32(location.as_ref(), arr[0], arr[1], arr[2]),
                    4 => gl.uniform_4_f32(location.as_ref(), arr[0], arr[1], arr[2], arr[3]),
                    _ => gl.uniform_1_f32_slice(location.as_ref(), arr),
                },
            }
        }
    }
}

fn upload_custom_textures(
    state: &GlRenderState,
    program: glow::NativeProgram,
    material: &CustomShaderMaterial,
) {
    let textures = match &material.textures {
        Some(t) => t,
        None => return,
    };
    let gl = &state.gl;
    let mut unit: u32 = 0;
    for (name, _texture) in textures {
        let location = unsafe { gl.get_uniform_location(program, name) };
        if location.is_none() {
            continue;
        }
        unsafe {
            gl.active_texture(glow::TEXTURE0 + unit);
            gl.uniform_1_i32(location.as_ref(), unit as i32);
        }
        unit += 1;
    }
}

pub fn register_gl_custom_shader_source(
    state: &GlRenderState,
    shader_key: &str,
    source: GlCustomMaterialShaderSource,
) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.program_cache.insert(
            format!("custom_source:{}", shader_key),
            Box::new(source),
        );
    });
}

pub fn register_gl_custom_shader_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        CUSTOM_SHADER_MATERIAL_KIND.to_string(),
        Arc::new(GlCustomShaderMeshMaterialRenderer),
    );
}
