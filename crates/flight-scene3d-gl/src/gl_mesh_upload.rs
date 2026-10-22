// flight-lint: allow-file(contract-vocabulary) D17 mesh uploads expose glow native handles over thread-bound render-gl state

use flight_entity::get_entity_id;
use flight_meshgeometry::{
    IndexBuffer, MeshGeometry, MeshSkinBindPose, PrimitiveTopology, VertexAttribute, VertexFormat,
    VertexSemantic, get_mesh_geometry_morph_bind_pose, get_mesh_geometry_skin_bind_pose,
};
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_scene3d_runtime::get_gl_scene3d_context_runtime;
use crate::types::GlMeshUpload;

// Enables and points one interleaved vertex attribute at its fixed shader location. Every built-in
// mesh shader declares these locations as float/vec inputs, so integer storage still uses
// vertexAttribPointer (GL converts uint joints to float and normalizes unorm weights/colors).
pub fn bind_gl_vertex_attribute(gl: &glow::Context, attribute: &VertexAttribute, stride: i32) {
    let Some(location) = get_attribute_location(attribute.semantic) else {
        return;
    };
    let (size, kind, normalized) = resolve_gl_vertex_format(attribute.format);
    // SAFETY: attribute setup runs on the owning GL thread against the bound VAO and buffer.
    unsafe {
        gl.enable_vertex_attrib_array(location);
        gl.vertex_attrib_pointer_f32(
            location,
            size,
            kind,
            normalized,
            stride,
            attribute.byte_offset as i32,
        );
    }
}

// Builds the STATIC bind-pose vertex buffer a GPU-skinned mesh uploads: a copy of the interleaved
// buffer with position and normal restored from the captured skin bind pose. The GPU deforms this fixed
// buffer through the joint palette.
fn build_skin_bind_vertices(geometry: &MeshGeometry, bind_pose: &MeshSkinBindPose) -> Vec<f32> {
    let mut out = geometry.vertices.to_vec();
    let layout = geometry.layout.read().unwrap();
    let floats_per_vertex = (layout.stride / 4) as usize;
    let position_offset = float_offset_for_semantic(&layout.attributes, VertexSemantic::Position);
    let normal_offset = float_offset_for_semantic(&layout.attributes, VertexSemantic::Normal);
    let normals = &bind_pose.normals;
    let positions = &bind_pose.positions;
    let vertex_count = positions.len() / 3;
    for v in 0..vertex_count {
        let base = v * floats_per_vertex;
        let s = v * 3;
        if let Some(offset) = position_offset {
            out[base + offset] = positions[s];
            out[base + offset + 1] = positions[s + 1];
            out[base + offset + 2] = positions[s + 2];
        }
        if let Some(offset) = normal_offset {
            out[base + offset] = normals[s];
            out[base + offset + 1] = normals[s + 1];
            out[base + offset + 2] = normals[s + 2];
        }
    }
    return out;
}

// Frees the GL objects owned by a mesh upload — the VAO and the vertex/index buffers. The upload must
// not be used after this call. Deleting an already-deleted GL object is a silent no-op.
pub fn destroy_gl_mesh_upload(state: &GlRenderState, upload: &GlMeshUpload) {
    let gl = &state.gl;
    // SAFETY: the upload's objects belong to this state's context.
    unsafe {
        gl.delete_vertex_array(upload.vao);
        gl.delete_buffer(upload.vertex_buffer);
        if let Some(buffer) = upload.index_buffer {
            gl.delete_buffer(buffer);
        }
    }
}

// Lazily uploads a MeshGeometry's interleaved vertex buffer + index buffer into a VAO for this state's
// context, caching the result by geometry in the context-owned scene mesh cache. Re-uploads when
// geometry.version moves past the cached version, reusing the existing GL objects. Leaves the VAO
// bound on return.
//
// `gpu_skinned` (default false) is true when the caller will GPU-skin this geometry: the uploaded
// buffer is then the STATIC bind pose (position/normal restored from the captured skin bind pose), so
// the GPU deforms bind → pose exactly once; it is uploaded once and reused while `skin_bind_uploaded`.
// A morphed geometry skips the restore/freeze: its per-frame morphed vertices are the bind input the
// GPU skins, so they upload as-is, version-tracked.
pub fn ensure_gl_mesh_upload(
    state: &GlRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: Option<bool>,
) -> GlMeshUpload {
    let gpu_skinned = gpu_skinned.unwrap_or(false);
    let gl = &state.gl;
    let key = get_entity_id(geometry);
    let cached = get_gl_scene3d_context_runtime(state)
        .upload_cache
        .get(&key)
        .copied();
    let primitive_mode = get_gl_primitive_mode(geometry.topology);

    let morphed = get_mesh_geometry_morph_bind_pose(geometry).is_some();
    let bind_pose = if gpu_skinned && !morphed {
        get_mesh_geometry_skin_bind_pose(geometry).cloned()
    } else {
        None
    };

    if let Some(mut upload) = cached {
        let reusable = if bind_pose.is_some() {
            upload.skin_bind_uploaded == Some(true)
        } else {
            upload.version == i64::from(geometry.version)
        };
        if reusable {
            upload.primitive_mode = primitive_mode;
            get_gl_scene3d_context_runtime(state)
                .upload_cache
                .insert(key, upload);
            // SAFETY: the cached VAO belongs to this context.
            unsafe { gl.bind_vertex_array(Some(upload.vao)) };
            return upload;
        }
    }

    let mut upload = match cached {
        Some(upload) => upload,
        None => {
            // SAFETY: allocation runs on the owning GL thread.
            let (vao, vertex_buffer) = unsafe {
                (
                    gl.create_vertex_array()
                        .unwrap_or_else(|error| flight_entity::throw_error(&error)),
                    gl.create_buffer()
                        .unwrap_or_else(|error| flight_entity::throw_error(&error)),
                )
            };
            GlMeshUpload {
                index_buffer: None,
                index_count: 0,
                index_type: glow::UNSIGNED_SHORT,
                primitive_mode,
                skin_bind_uploaded: None,
                vao,
                version: -1,
                vertex_buffer,
            }
        }
    };

    // SAFETY: upload runs on the owning GL thread; every byte view lives through its call.
    unsafe {
        gl.bind_vertex_array(Some(upload.vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(upload.vertex_buffer));
        match &bind_pose {
            Some(pose) => {
                let vertices = build_skin_bind_vertices(geometry, &pose.read().unwrap());
                gl.buffer_data_u8_slice(
                    glow::ARRAY_BUFFER,
                    f32_bytes(&vertices),
                    glow::STATIC_DRAW,
                );
            }
            None => {
                gl.buffer_data_u8_slice(
                    glow::ARRAY_BUFFER,
                    f32_bytes(&geometry.vertices),
                    glow::STATIC_DRAW,
                );
            }
        }
    }
    upload.skin_bind_uploaded = Some(bind_pose.is_some());

    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride as i32;
    for attribute in &layout.attributes {
        bind_gl_vertex_attribute(gl, attribute, stride);
    }

    match &geometry.indices {
        IndexBuffer::None => {
            if let Some(buffer) = upload.index_buffer.take() {
                // SAFETY: the stale index buffer belongs to this context.
                unsafe { gl.delete_buffer(buffer) };
            }
            upload.index_count = if layout.stride > 0 {
                ((geometry.vertices.len() * 4) / layout.stride as usize) as u32
            } else {
                0
            };
        }
        indices => {
            let buffer = match upload.index_buffer {
                Some(buffer) => buffer,
                None => {
                    // SAFETY: allocation runs on the owning GL thread.
                    let buffer = unsafe { gl.create_buffer() }
                        .unwrap_or_else(|error| flight_entity::throw_error(&error));
                    upload.index_buffer = Some(buffer);
                    buffer
                }
            };
            // SAFETY: the index buffer belongs to this context and the bound VAO captures it.
            unsafe {
                gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(buffer));
                match indices {
                    IndexBuffer::U16(value) => {
                        let data = value.data.read().unwrap();
                        gl.buffer_data_u8_slice(
                            glow::ELEMENT_ARRAY_BUFFER,
                            u16_bytes(&data),
                            glow::STATIC_DRAW,
                        );
                        upload.index_type = glow::UNSIGNED_SHORT;
                        upload.index_count = data.len() as u32;
                    }
                    IndexBuffer::U32(value) => {
                        let data = value.data.read().unwrap();
                        gl.buffer_data_u8_slice(
                            glow::ELEMENT_ARRAY_BUFFER,
                            u32_bytes(&data),
                            glow::STATIC_DRAW,
                        );
                        upload.index_type = glow::UNSIGNED_INT;
                        upload.index_count = data.len() as u32;
                    }
                    IndexBuffer::None => {}
                }
            }
        }
    }

    upload.primitive_mode = primitive_mode;
    upload.version = i64::from(geometry.version);
    get_gl_scene3d_context_runtime(state)
        .upload_cache
        .insert(key, upload);
    return upload;
}

fn f32_bytes(values: &[f32]) -> &[u8] {
    // SAFETY: u8 has alignment one and the view has the same lifetime as the input slice.
    return unsafe {
        std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
    };
}

// The float offset (byteOffset / 4) of a semantic within an interleaved vertex record, or None when
// the layout does not carry it (TS -1).
fn float_offset_for_semantic(
    attributes: &[VertexAttribute],
    semantic: VertexSemantic,
) -> Option<usize> {
    for attribute in attributes {
        if attribute.semantic == semantic {
            return Some((attribute.byte_offset / 4) as usize);
        }
    }
    return None;
}

// Vertex attribute locations the mesh vertex shaders fix with layout(location = …); the upload's VAO
// wires the interleaved buffer to these by semantic. Locations 0–3 are the canonical PBR record
// (position/normal/tangent/uv0); `color0` (4) is bound only when a layout carries it; `uv1` (5) is the
// second UV set; `joints0`/`weights0` (6–7) are the skinning channels. Semantics absent from a layout
// are left unbound, and GL reads an unbound float attribute as zero: a deliberate fallback that
// `explain_gl_mesh_geometry_uv_sets` names.
fn get_attribute_location(semantic: VertexSemantic) -> Option<u32> {
    return match semantic {
        VertexSemantic::Color0 => Some(4),
        VertexSemantic::Joints0 => Some(6),
        VertexSemantic::Normal => Some(1),
        VertexSemantic::Position => Some(0),
        VertexSemantic::Tangent => Some(2),
        VertexSemantic::Uv0 => Some(3),
        VertexSemantic::Uv1 => Some(5),
        VertexSemantic::Weights0 => Some(7),
    };
}

fn get_gl_primitive_mode(topology: PrimitiveTopology) -> u32 {
    return match topology {
        PrimitiveTopology::LineList => glow::LINES,
        PrimitiveTopology::LineStrip => glow::LINE_STRIP,
        PrimitiveTopology::PointList => glow::POINTS,
        PrimitiveTopology::TriangleStrip => glow::TRIANGLE_STRIP,
        PrimitiveTopology::TriangleList => glow::TRIANGLES,
    };
}

// Maps a VertexFormat to its (componentCount, glType, normalized) tuple.
fn resolve_gl_vertex_format(format: VertexFormat) -> (i32, u32, bool) {
    return match format {
        VertexFormat::Float32x2 => (2, glow::FLOAT, false),
        VertexFormat::Float32x3 => (3, glow::FLOAT, false),
        VertexFormat::Float32x4 => (4, glow::FLOAT, false),
        VertexFormat::Uint8x4 => (4, glow::UNSIGNED_BYTE, false),
        VertexFormat::Unorm8x4 => (4, glow::UNSIGNED_BYTE, true),
        VertexFormat::Uint16x4 => (4, glow::UNSIGNED_SHORT, false),
    };
}

fn u16_bytes(values: &[u16]) -> &[u8] {
    // SAFETY: u8 has alignment one and the view has the same lifetime as the input slice.
    return unsafe {
        std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
    };
}

fn u32_bytes(values: &[u32]) -> &[u8] {
    // SAFETY: u8 has alignment one and the view has the same lifetime as the input slice.
    return unsafe {
        std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
    };
}
