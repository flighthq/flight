//! GL fullscreen quad — a reusable vertex/index buffer pair for drawing a
//! viewport-covering quad.

use glow::HasContext;

use crate::render_state::GlRenderState;

/// A pair of GPU buffers (vertex + index) for a fullscreen quad covering
/// NDC `[-1, 1]` with UV `[0, 1]`. Four vertices, six indices.
#[derive(Debug)]
pub struct GlFullscreenQuad {
    pub vertex_buffer: glow::Buffer,
    pub index_buffer: glow::Buffer,
}

/// Allocates vertex and index buffers for a fullscreen quad in NDC space.
pub fn create_gl_fullscreen_quad(state: &GlRenderState) -> GlFullscreenQuad {
    let gl = &state.gl;
    unsafe {
        #[rustfmt::skip]
        let vertices: [f32; 16] = [
            -1.0, -1.0,  0.0, 0.0,
             1.0, -1.0,  1.0, 0.0,
             1.0,  1.0,  1.0, 1.0,
            -1.0,  1.0,  0.0, 1.0,
        ];
        let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];

        let vertex_buffer = gl.create_buffer().expect("create fullscreen quad vbo");
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vertex_buffer));
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            crate::bytemuck_f32(&vertices),
            glow::STATIC_DRAW,
        );

        let index_buffer = gl.create_buffer().expect("create fullscreen quad ibo");
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
        gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            crate::bytemuck_u16(&indices),
            glow::STATIC_DRAW,
        );

        GlFullscreenQuad {
            vertex_buffer,
            index_buffer,
        }
    }
}

/// Frees the GPU resources owned by `quad`.
pub fn destroy_gl_fullscreen_quad(state: &GlRenderState, quad: GlFullscreenQuad) {
    unsafe {
        state.gl.delete_buffer(quad.vertex_buffer);
        state.gl.delete_buffer(quad.index_buffer);
    }
}

/// Draws the fullscreen quad using whatever shader and texture are currently
/// bound.
pub fn draw_gl_fullscreen_quad(state: &GlRenderState, quad: &GlFullscreenQuad) {
    let gl = &state.gl;
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(quad.vertex_buffer));
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(quad.index_buffer));
        gl.vertex_attrib_pointer_f32(0, 2, glow::FLOAT, false, 16, 0);
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(1, 2, glow::FLOAT, false, 16, 8);
        gl.enable_vertex_attrib_array(1);
        gl.draw_elements(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gl_fullscreen_quad_struct_is_debug() {
        let _s = format!("{:?}", std::any::type_name::<GlFullscreenQuad>());
    }
}
