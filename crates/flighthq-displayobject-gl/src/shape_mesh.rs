//! GL shape mesh — GPU-side triangle mesh for vector shapes.

use glow::HasContext;

use flighthq_render_gl::{GlRenderState, bytemuck_f32, bytemuck_u16};

/// A GPU triangle mesh for a vector shape.
#[derive(Debug)]
pub struct GlShapeMesh {
    pub vertex_buffer: glow::Buffer,
    pub index_buffer: glow::Buffer,
    pub index_count: u32,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates a `GlShapeMesh` from flat vertex and index arrays.
pub fn create_gl_shape_mesh(
    state: &mut GlRenderState,
    vertices: &[f32],
    indices: &[u16],
) -> GlShapeMesh {
    unsafe {
        let vertex_buffer = state.gl.create_buffer().expect("create vertex buffer");
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(vertex_buffer));
        state.gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_f32(vertices),
            glow::STATIC_DRAW,
        );

        let index_buffer = state.gl.create_buffer().expect("create index buffer");
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
        state.gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            bytemuck_u16(indices),
            glow::STATIC_DRAW,
        );

        GlShapeMesh {
            vertex_buffer,
            index_buffer,
            index_count: indices.len() as u32,
        }
    }
}

/// Frees the GL buffers owned by `mesh`.
pub fn destroy_gl_shape_mesh(state: &GlRenderState, mesh: GlShapeMesh) {
    unsafe {
        state.gl.delete_buffer(mesh.vertex_buffer);
        state.gl.delete_buffer(mesh.index_buffer);
    }
}

/// Draws the shape's tessellated fill `meshes` for `render_proxy_id` using the
/// currently-bound GL program and the caller's already-set uniforms.
///
/// Each non-empty mesh binds its vertex and index buffers and issues an indexed
/// draw. Mirrors the TS `drawGlShapeMeshes` and `draw_wgpu_shape_meshes`, which
/// likewise draw a slice of meshes against the active program. Prefer
/// [`draw_gl_shape_fill`](crate::draw_gl_shape_fill) for the cached,
/// program-managed path; this lower-level helper is for callers that own the
/// program and uniform binding themselves.
pub fn draw_gl_shape_meshes(
    state: &mut GlRenderState,
    _render_proxy_id: u64,
    meshes: &[GlShapeMesh],
) {
    for mesh in meshes {
        if mesh.index_count == 0 {
            continue;
        }
        unsafe {
            state
                .gl
                .bind_buffer(glow::ARRAY_BUFFER, Some(mesh.vertex_buffer));
            state
                .gl
                .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(mesh.index_buffer));
            state.gl.draw_elements(
                glow::TRIANGLES,
                mesh.index_count as i32,
                glow::UNSIGNED_SHORT,
                0,
            );
        }
    }
}

#[cfg(test)]
mod tests {}
