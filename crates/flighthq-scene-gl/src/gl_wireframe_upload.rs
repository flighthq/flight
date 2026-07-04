//! Wireframe GPU upload — derived line-index buffer from triangle geometry.
//!
//! Ports `@flighthq/scene-gl` `glWireframeUpload.ts`.

use flighthq_render_gl::GlRenderState;

/// The wireframe GPU upload of one `MeshGeometry`.
#[derive(Debug)]
pub struct GlWireframeUpload {
    pub index_type: u32,
    pub line_index_buffer: Option<glow::Buffer>,
    pub vao: Option<glow::VertexArray>,
    pub version: i64,
}

/// Frees the GL objects owned by a wireframe upload.
pub fn destroy_gl_wireframe_upload(state: &mut GlRenderState, upload: &GlWireframeUpload) {
    let gl = &state.gl;
    unsafe {
        if let Some(vao) = upload.vao {
            gl.delete_vertex_array(vao);
        }
        if let Some(buffer) = upload.line_index_buffer {
            gl.delete_buffer(buffer);
        }
    }
}

/// Lazily derives and uploads the wireframe line-index VAO for a geometry.
///
/// Stub: the full port requires the MeshGeometry vertex layout and index
/// buffer access from the Rust types.
pub fn ensure_gl_wireframe_upload(
    _state: &mut GlRenderState,
    _geometry_id: u64,
) -> GlWireframeUpload {
    GlWireframeUpload {
        index_type: glow::UNSIGNED_SHORT,
        line_index_buffer: None,
        vao: None,
        version: -1,
    }
}

use glow::HasContext;
