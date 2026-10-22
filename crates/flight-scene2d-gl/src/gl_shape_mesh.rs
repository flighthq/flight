// flight-lint: allow-file(contract-vocabulary) D17 mesh draw contracts expose glow native handles and thread-bound render-gl state

use flight_entity::throw_error;
use flight_render::RenderProxy2D;
use flight_render_gl::{
    GlBoundShader, GlRenderState, GlShapeMeshBinding, GlShapeMeshResources, create_gl_program,
};
use glow::HasContext;

use crate::gl_quad_batch_writer::{
    flush_gl_quad_batch_writer, get_gl_viewport_size, gl_f32_bytes, gl_u16_bytes,
};
use crate::types::{GlShapeMesh, resolve_gl_color_adjustment_material_feature};

// GPU tessellated solid-fill path for Shape — the replacement for the canvas-raster-to-texture
// shortcut (which is resolution-bound, so circles go jagged when scaled up). Each fill region is
// tessellated to a triangle mesh (CPU, cached by content version) and drawn here with a flat-color
// program, transformed by the node world transform in the vertex shader so it stays crisp at any
// zoom. Gradient/texture styles and pathological stroke centerlines still take the raster path.

const VERTEX_SOURCE: &str = "
attribute vec2 a_position;
uniform mat3 u_matrix;
void main() {
  vec3 p = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}
";

const FRAGMENT_SOURCE: &str = "
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
";

// Draws the shape's tessellated fill meshes through `binding`. Flushes the quad-batch writer first
// (these go through a separate program), honors the node blend mode and alpha, and is gated by any
// active clip stencil. Records the program as the current shader so the next content draw re-binds
// its own program. Uploads premultiplied color per mesh for the standard ONE / ONE_MINUS_SRC_ALPHA
// blend. `on_program_bound` runs after the program and matrix are set but before the draw loop.
pub fn draw_gl_shape_mesh_batch(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
    meshes: &[GlShapeMesh],
    binding: &GlShapeMeshBinding,
    on_program_bound: Option<&dyn Fn(&GlRenderState)>,
) {
    if meshes.is_empty() {
        return;
    }
    flush_gl_quad_batch_writer(state);

    let gl = std::rc::Rc::clone(&state.gl);
    // SAFETY: the program belongs to this context and binding occurs on the GL thread.
    unsafe { gl.use_program(Some(binding.program)) };
    state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
        locations: None,
        program: binding.program,
    });

    if let Some(apply_blend_mode) = state.apply_blend_mode {
        apply_blend_mode(state, render_proxy.blend_mode.as_ref());
    }
    let matrix = shape_mesh_matrix(state, render_proxy);
    // SAFETY: the matrix location belongs to the bound program on this GL thread.
    unsafe {
        gl.uniform_matrix_3_f32_slice(binding.matrix_location.as_ref(), false, &matrix);
    }
    if let Some(on_program_bound) = on_program_bound {
        on_program_bound(state);
    }

    // SAFETY: the shared mesh buffers belong to this context; uploads and draws occur on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(binding.vertex_buffer));
        gl.enable_vertex_attrib_array(binding.position_location);
        gl.vertex_attrib_pointer_f32(binding.position_location, 2, glow::FLOAT, false, 0, 0);
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(binding.index_buffer));

        let node_alpha = render_proxy.alpha;
        for mesh in meshes {
            if mesh.indices.is_empty() {
                continue;
            }
            let a = mesh.alpha * node_alpha;
            if a <= 0.0 {
                continue;
            }
            let r = ((mesh.color >> 24) & 0xff) as f32 / 255.0;
            let g = ((mesh.color >> 16) & 0xff) as f32 / 255.0;
            let b = ((mesh.color >> 8) & 0xff) as f32 / 255.0;
            let ca = ((mesh.color & 0xff) as f32 / 255.0) * a;
            gl.uniform_4_f32(binding.color_location.as_ref(), r * ca, g * ca, b * ca, ca);
            gl.buffer_data_u8_slice(
                glow::ARRAY_BUFFER,
                gl_f32_bytes(&mesh.vertices),
                glow::STREAM_DRAW,
            );
            gl.buffer_data_u8_slice(
                glow::ELEMENT_ARRAY_BUFFER,
                gl_u16_bytes(&mesh.indices),
                glow::STREAM_DRAW,
            );
            gl.draw_elements(
                glow::TRIANGLES,
                mesh.indices.len() as i32,
                glow::UNSIGNED_SHORT,
                0,
            );
        }

        gl.disable_vertex_attrib_array(binding.position_location);
    }
}

// Draws the shape's tessellated fill meshes. Delegates to the opt-in color-adjustment fold when it
// is installed AND the node carries a color adjustment; otherwise runs the lean flat-color program.
pub fn draw_gl_shape_meshes(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
    meshes: &[GlShapeMesh],
) {
    if meshes.is_empty() {
        return;
    }
    if let Some(fold) = resolve_gl_color_adjustment_material_feature(state)
        && (render_proxy.color_matrix.is_some() || render_proxy.color_scale_bias.is_some())
    {
        (fold.draw_shape_meshes)(state, render_proxy, meshes);
        return;
    }
    let binding = ensure_gl_shape_mesh_program(state);
    draw_gl_shape_mesh_batch(state, render_proxy, meshes, &binding, None);
}

// The lean flat-color mesh binding for `state`, compiled once per context. The base path and the
// fold's tinted draw (which borrows these shared vertex/index buffers) resolve it here.
pub fn ensure_gl_shape_mesh_program(state: &GlRenderState) -> GlShapeMeshBinding {
    if let Some(resources) = &state.context_state.runtime_state.borrow().shape_mesh_resources {
        return resources.binding.clone();
    }

    let gl = &state.gl;
    let program = create_gl_program(gl, VERTEX_SOURCE, FRAGMENT_SOURCE, Some("Shape-mesh"))
        .unwrap_or_else(|error| throw_error(&error));
    // SAFETY: allocation and location queries occur on the GL thread for this context's program.
    let binding = unsafe {
        GlShapeMeshBinding {
            program,
            vertex_buffer: gl
                .create_buffer()
                .unwrap_or_else(|error| throw_error(&format!("ensureGlShapeMeshProgram: {error}"))),
            index_buffer: gl
                .create_buffer()
                .unwrap_or_else(|error| throw_error(&format!("ensureGlShapeMeshProgram: {error}"))),
            position_location: gl.get_attrib_location(program, "a_position").unwrap_or(0),
            matrix_location: gl.get_uniform_location(program, "u_matrix"),
            color_location: gl.get_uniform_location(program, "u_color"),
        }
    };
    state.context_state.runtime_state.borrow_mut().shape_mesh_resources =
        Some(GlShapeMeshResources {
            binding: binding.clone(),
            color_matrix_shader: None,
            color_scale_bias_shader: None,
        });
    return binding;
}

// Column-major mat3 = projection · world transform, mapping shape-local points to clip space —
// identical to the quad-batch writer's projection so the mesh aligns with everything else.
fn shape_mesh_matrix(state: &GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) -> [f32; 9] {
    let (width, height) = get_gl_viewport_size(state);
    let iw = 2.0 / if width == 0.0 { 1.0 } else { width };
    let ih = 2.0 / if height == 0.0 { 1.0 } else { height };
    let t = &render_proxy.transform_2d;
    return [
        t.a * iw,
        -t.b * ih,
        0.0,
        t.c * iw,
        -t.d * ih,
        0.0,
        t.tx * iw - 1.0,
        -t.ty * ih + 1.0,
        1.0,
    ];
}
