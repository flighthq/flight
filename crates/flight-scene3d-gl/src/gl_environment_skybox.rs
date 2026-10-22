// flight-lint: allow-file(contract-vocabulary) D17 the skybox pass draws through native glow handles on thread-bound render-gl state

use flight_camera::{Camera3D, update_camera_3d_inverse_view_projection};
use flight_entity::throw_error;
use flight_lighting::Environment;
use flight_render_gl::{GlRenderState, create_gl_program};
use glow::{HasContext, NativeBuffer, NativeProgram, NativeUniformLocation, NativeVertexArray};

use crate::gl_environment_cube::ensure_gl_environment_source_cube;
use crate::gl_scene3d_runtime::{add_gl_scene3d_resource_cleanup, get_gl_scene3d_runtime};

/// TS `GlSkybox` (module-private): the compiled skybox pass.
#[derive(Clone, Copy, Debug)]
pub(crate) struct GlSkybox {
    pub(crate) loc_env_cube: Option<NativeUniformLocation>,
    pub(crate) loc_inverse_view_projection: Option<NativeUniformLocation>,
    pub(crate) loc_intensity: Option<NativeUniformLocation>,
    pub(crate) program: NativeProgram,
    pub(crate) vao: NativeVertexArray,
    // Retained solely so teardown can free it. The VAO holds the only other reference once the attribute
    // pointer is set, and a VAO does not own its buffers, so dropping this handle leaks the buffer for the
    // lifetime of the context.
    pub(crate) vertex_buffer: NativeBuffer,
}

// Frees the skybox program, VAO and vertex buffer cached for `state`. These are held in their own
// runtime slot (TS: module-local, keyed by state); destroy_gl_scene3d_runtime calls this through the
// cleanup it registers, the same way it reaches the IBL bake programs. A no-op when no skybox has been
// drawn for the state, and safe to call twice.
pub fn destroy_gl_environment_skybox(state: &mut GlRenderState) {
    let Some(sky) = get_gl_scene3d_runtime(state).environment_skybox.take() else {
        return;
    };
    let gl = &state.gl;
    // SAFETY: the skybox objects belong to this state's context, on its owning GL thread.
    unsafe {
        gl.delete_program(sky.program);
        gl.delete_vertex_array(sky.vao);
        gl.delete_buffer(sky.vertex_buffer);
    }
}

fn ensure_gl_skybox(state: &GlRenderState) -> GlSkybox {
    let gl = &state.gl;
    if let Some(sky) = get_gl_scene3d_runtime(state).environment_skybox {
        return sky;
    }

    // First skybox for this state: hand teardown to the scene runtime rather than being destroyed by name.
    add_gl_scene3d_resource_cleanup(state, destroy_gl_environment_skybox);
    let program = link_gl_skybox_program(gl);
    // SAFETY: resource creation and attribute setup run on the state's owning GL thread.
    let sky = unsafe {
        let vao = gl.create_vertex_array().unwrap_or_else(|error| throw_error(&error));
        gl.bind_vertex_array(Some(vao));
        let buffer = gl.create_buffer().unwrap_or_else(|error| throw_error(&error));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, f32_bytes(&QUAD), glow::STATIC_DRAW);
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 2, glow::FLOAT, false, 0, 0);
        gl.bind_vertex_array(None);

        GlSkybox {
            loc_env_cube: gl.get_uniform_location(program, "u_envCube"),
            loc_inverse_view_projection: gl.get_uniform_location(program, "u_inverseViewProjection"),
            loc_intensity: gl.get_uniform_location(program, "u_intensity"),
            program,
            vao,
            vertex_buffer: buffer,
        }
    };
    get_gl_scene3d_runtime(state).environment_skybox = Some(sky);
    return sky;
}

fn f32_bytes(values: &[f32]) -> &[u8] {
    // SAFETY: f32 has no padding and u8 has alignment 1, so the view covers exactly the same bytes.
    return unsafe { std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values)) };
}

fn link_gl_skybox_program(gl: &glow::Context) -> NativeProgram {
    return create_gl_program(gl, SKYBOX_VERTEX, SKYBOX_FRAGMENT, Some("Skybox"))
        .unwrap_or_else(|error| throw_error(&error));
}

// Draws the environment's radiance cubemap as the scene backdrop: a screen-filling pass that, per
// pixel, reconstructs the world-space view ray from the inverse view-projection and samples the cube.
// The quad is emitted at the far plane (clip z = w) with depth writes off, so it fills only pixels the
// opaque scene has not yet covered and never occludes geometry. Call it once, after the color target
// is bound and cleared and before render_gl_scene3d. A no-op when the environment has no complete
// source cube. `aspect` is the viewport width / height (matches the camera aspect render_gl_scene3d uses).
pub fn render_gl_environment_skybox(
    state: &GlRenderState,
    environment: &Environment,
    camera: &Camera3D,
    aspect: f32,
) {
    let Some(cube) = ensure_gl_environment_source_cube(state, environment) else {
        return;
    };

    let gl = &state.gl;
    let sky = ensure_gl_skybox(state);

    if !update_camera_3d_inverse_view_projection(camera, aspect) {
        return;
    }

    // Every one of these is saved, not just the depth test: the pass runs between a caller's own draws,
    // so depth_mask is restored to what the caller had rather than to a hardcoded true.
    // SAFETY: the pass runs on the state's owning GL thread with handles from its context.
    unsafe {
        let prev_depth_test = gl.is_enabled(glow::DEPTH_TEST);
        let prev_depth_mask = gl.get_parameter_bool(glow::DEPTH_WRITEMASK);
        let prev_blend = gl.is_enabled(glow::BLEND);
        gl.depth_mask(false);
        gl.disable(glow::DEPTH_TEST);
        gl.disable(glow::BLEND);

        gl.use_program(Some(sky.program));
        let inverse_view_projection = camera.inverse_view_projection.read().unwrap().m;
        gl.uniform_matrix_4_f32_slice(
            sky.loc_inverse_view_projection.as_ref(),
            false,
            &inverse_view_projection,
        );
        gl.uniform_1_f32(sky.loc_intensity.as_ref(), environment.intensity);
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(cube));
        gl.uniform_1_i32(sky.loc_env_cube.as_ref(), 0);

        gl.bind_vertex_array(Some(sky.vao));
        gl.draw_arrays(glow::TRIANGLE_STRIP, 0, 4);
        gl.bind_vertex_array(None);

        gl.depth_mask(prev_depth_mask);
        if prev_depth_test {
            gl.enable(glow::DEPTH_TEST);
        }
        if prev_blend {
            gl.enable(glow::BLEND);
        }
    }
}

const QUAD: [f32; 8] = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

macro_rules! skybox_vertex_glsl {
    () => {
        concat!(r#"#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_ndc;
void main() {
  v_ndc = a_position;
  // Emit at the far plane (z = w) so the backdrop sits behind every drawn fragment.
  gl_Position = vec4(a_position, 1.0, 1.0);
}
"#)
    };
}

const SKYBOX_VERTEX: &str = skybox_vertex_glsl!();

macro_rules! skybox_fragment_glsl {
    () => {
        concat!(r#"#version 300 es
precision highp float;
in vec2 v_ndc;
uniform samplerCube u_envCube;
uniform mat4 u_inverseViewProjection;
uniform float u_intensity;
out vec4 fragColor;

void main() {
  // Reconstruct the world-space ray through this pixel from the near- and far-plane unprojections.
  vec4 nearW = u_inverseViewProjection * vec4(v_ndc, -1.0, 1.0);
  vec4 farW = u_inverseViewProjection * vec4(v_ndc, 1.0, 1.0);
  vec3 dir = normalize(farW.xyz / farW.w - nearW.xyz / nearW.w);
  vec3 color = texture(u_envCube, dir).rgb * u_intensity;
  fragColor = vec4(color, 1.0);
}
"#)
    };
}

const SKYBOX_FRAGMENT: &str = skybox_fragment_glsl!();
