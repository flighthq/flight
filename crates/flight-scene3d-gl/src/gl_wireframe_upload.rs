// flight-lint: allow-file(contract-vocabulary) D17 wireframe uploads expose glow native handles over thread-bound render-gl state

use flight_entity::{get_entity_id, throw_error};
use flight_meshgeometry::{IndexBuffer, MeshGeometry, VertexSemantic};
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_upload::{bind_gl_vertex_attribute, ensure_gl_mesh_upload};
use crate::gl_scene3d_runtime::get_gl_scene3d_context_runtime;
use crate::types::GlWireframeUpload;

// The derived line-list index array, in the narrowest element width that holds it.
enum GlWireframeLineIndices {
    U16(Vec<u16>),
    U32(Vec<u32>),
}

// Frees the GL objects owned by a wireframe upload — the VAO and the line-index buffer. It does NOT
// delete the vertex buffer: that is the shared triangle upload's buffer (see ensure_gl_wireframe_upload),
// freed by destroy_gl_mesh_upload for that geometry, not here. Deleting an already-deleted GL object is
// a silent no-op.
pub fn destroy_gl_wireframe_upload(state: &GlRenderState, upload: &GlWireframeUpload) {
    let gl = &state.gl;
    // SAFETY: the upload's objects belong to this state's context.
    unsafe {
        gl.delete_vertex_array(upload.vao);
        gl.delete_buffer(upload.line_index_buffer);
    }
}

// Lazily derives and uploads the wireframe line-index VAO for a geometry on this state, caching it
// keyed by the geometry entity (D15: by entity id, on the context tier beside the triangle upload
// cache). Reuses the geometry's interleaved vertex buffer (ensuring the triangle upload first), binds
// only the position (and skin influence) attributes, and builds a line-list index buffer from the
// triangle indices. Leaves the wireframe VAO bound on return so the draw path issues its LINES draw
// immediately after. A subset's triangle range [index_offset, +index_count) maps to the line range
// [index_offset * 2, +index_count * 2) (each triangle index yields two line indices), so the renderer
// draws a sub-range of this buffer.
pub fn ensure_gl_wireframe_upload(
    state: &GlRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: Option<bool>,
) -> GlWireframeUpload {
    let gl = &state.gl;
    let mesh_upload = ensure_gl_mesh_upload(state, geometry, Some(gpu_skinned.unwrap_or(false)));

    let key = get_entity_id(geometry);
    let cached = get_gl_scene3d_context_runtime(state)
        .wireframe_upload_cache
        .get(&key)
        .copied();
    if let Some(upload) = cached
        && upload.version == i64::from(geometry.version)
    {
        // SAFETY: the cached VAO belongs to this context.
        unsafe { gl.bind_vertex_array(Some(upload.vao)) };
        return upload;
    }

    let line_indices = build_line_indices(geometry);
    let index_type = match line_indices {
        GlWireframeLineIndices::U32(_) => glow::UNSIGNED_INT,
        GlWireframeLineIndices::U16(_) => glow::UNSIGNED_SHORT,
    };

    let mut upload = match cached {
        Some(upload) => upload,
        None => {
            // SAFETY: allocation runs on the owning GL thread.
            let (line_index_buffer, vao) = unsafe {
                (
                    gl.create_buffer().unwrap_or_else(|error| throw_error(&error)),
                    gl.create_vertex_array().unwrap_or_else(|error| throw_error(&error)),
                )
            };
            GlWireframeUpload {
                index_type,
                line_index_buffer,
                vao,
                version: -1,
            }
        }
    };
    upload.index_type = index_type;

    // SAFETY: the VAO belongs to this context.
    unsafe { gl.bind_vertex_array(Some(upload.vao)) };

    // Bind the shared interleaved vertex buffer and wire position plus the optional skin influence
    // attributes. The rigid vertex variant ignores locations 6/7; the skinned variant consumes them.
    // SAFETY: the shared vertex buffer belongs to this context.
    unsafe { gl.bind_buffer(glow::ARRAY_BUFFER, Some(mesh_upload.vertex_buffer)) };
    {
        let layout = geometry.layout.read().unwrap();
        let stride = layout.stride as i32;
        for attribute in &layout.attributes {
            if matches!(
                attribute.semantic,
                VertexSemantic::Position | VertexSemantic::Joints0 | VertexSemantic::Weights0
            ) {
                bind_gl_vertex_attribute(gl, attribute, stride);
            }
        }
    }

    let bytes: Vec<u8> = match &line_indices {
        GlWireframeLineIndices::U16(lines) => lines.iter().flat_map(|index| index.to_ne_bytes()).collect(),
        GlWireframeLineIndices::U32(lines) => lines.iter().flat_map(|index| index.to_ne_bytes()).collect(),
    };
    // SAFETY: the line-index buffer belongs to this context and the bound VAO captures it.
    unsafe {
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(upload.line_index_buffer));
        gl.buffer_data_u8_slice(glow::ELEMENT_ARRAY_BUFFER, &bytes, glow::STATIC_DRAW);
    }

    upload.version = i64::from(geometry.version);
    get_gl_scene3d_context_runtime(state)
        .wireframe_upload_cache
        .insert(key, upload);
    return upload;
}

// Builds the line-list index array (two indices per triangle edge, three edges per triangle) from a
// geometry's triangle indices, or from a sequential range when the geometry is non-indexed. Promotes to
// u32 when any index exceeds the u16 range.
fn build_line_indices(geometry: &MeshGeometry) -> GlWireframeLineIndices {
    let triangle_indices: Option<Vec<u32>> = match &geometry.indices {
        IndexBuffer::U16(value) => Some(value.data.read().unwrap().iter().map(|index| u32::from(*index)).collect()),
        IndexBuffer::U32(value) => Some(value.data.read().unwrap().to_vec()),
        IndexBuffer::None => None,
    };
    let triangle_count = match &triangle_indices {
        Some(indices) => indices.len() / 3,
        None => {
            let stride = geometry.layout.read().unwrap().stride as usize;
            if stride > 0 {
                (geometry.vertices.len() * 4) / stride / 3
            } else {
                0
            }
        }
    };

    let line_count = triangle_count * 6;
    let use_uint32 = matches!(geometry.indices, IndexBuffer::U32(_)) || line_count > 65535;
    let mut lines = vec![0_u32; line_count];

    for t in 0..triangle_count {
        let base = t * 3;
        let (i0, i1, i2) = match &triangle_indices {
            Some(indices) => (indices[base], indices[base + 1], indices[base + 2]),
            None => (base as u32, base as u32 + 1, base as u32 + 2),
        };
        let out = t * 6;
        lines[out] = i0;
        lines[out + 1] = i1;
        lines[out + 2] = i1;
        lines[out + 3] = i2;
        lines[out + 4] = i2;
        lines[out + 5] = i0;
    }
    if use_uint32 {
        return GlWireframeLineIndices::U32(lines);
    }
    return GlWireframeLineIndices::U16(lines.iter().map(|index| *index as u16).collect());
}
