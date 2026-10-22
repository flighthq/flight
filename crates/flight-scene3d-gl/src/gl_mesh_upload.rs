use flight_entity::get_entity_id;
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU16, IndexBufferU32, MeshGeometry, VertexAttribute, VertexFormat,
    VertexSemantic, get_mesh_geometry_morph_bind_pose, get_mesh_geometry_skin_bind_pose,
};
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::GlMeshUpload;

fn attribute_location(semantic: VertexSemantic) -> Option<u32> {
    return match semantic {
        VertexSemantic::Position => Some(0),
        VertexSemantic::Normal => Some(1),
        VertexSemantic::Tangent => Some(2),
        VertexSemantic::Uv0 => Some(3),
        VertexSemantic::Color0 => Some(4),
        VertexSemantic::Uv1 => Some(5),
        VertexSemantic::Joints0 => Some(6),
        VertexSemantic::Weights0 => Some(7),
    };
}

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

pub fn bind_gl_vertex_attribute(
    gl: &glow::Context,
    attribute: &VertexAttribute,
    stride: u32,
) {
    let location = match attribute_location(attribute.semantic) {
        Some(loc) => loc,
        None => return,
    };
    let (size, gl_type, normalized) = resolve_gl_vertex_format(attribute.format);
    unsafe {
        gl.enable_vertex_attrib_array(location);
        gl.vertex_attrib_pointer_f32(
            location,
            size,
            gl_type,
            normalized,
            stride as i32,
            attribute.byte_offset as i32,
        );
    }
}

fn get_gl_primitive_mode(topology: flight_meshgeometry::PrimitiveTopology) -> u32 {
    return match topology {
        flight_meshgeometry::PrimitiveTopology::LineList => glow::LINES,
        flight_meshgeometry::PrimitiveTopology::LineStrip => glow::LINE_STRIP,
        flight_meshgeometry::PrimitiveTopology::PointList => glow::POINTS,
        flight_meshgeometry::PrimitiveTopology::TriangleStrip => glow::TRIANGLE_STRIP,
        flight_meshgeometry::PrimitiveTopology::TriangleList => glow::TRIANGLES,
    };
}

fn float_offset_for_semantic(geometry: &MeshGeometry, semantic: VertexSemantic) -> i32 {
    let layout = geometry.layout.read().unwrap();
    for attr in &layout.attributes {
        if attr.semantic == semantic {
            return (attr.byte_offset / 4) as i32;
        }
    }
    return -1;
}

fn build_skin_bind_vertices(
    geometry: &MeshGeometry,
    bind_pose: &flight_meshgeometry::MeshSkinBindPose,
) -> Vec<f32> {
    let mut out: Vec<f32> = geometry.vertices.to_vec();
    let layout = geometry.layout.read().unwrap();
    let floats_per_vertex = (layout.stride / 4) as usize;
    drop(layout);
    let position_offset = float_offset_for_semantic(geometry, VertexSemantic::Position);
    let normal_offset = float_offset_for_semantic(geometry, VertexSemantic::Normal);
    let positions = &bind_pose.positions;
    let normals = &bind_pose.normals;
    let vertex_count = positions.len() / 3;
    for v in 0..vertex_count {
        let base = v * floats_per_vertex;
        let s = v * 3;
        if position_offset >= 0 {
            let po = position_offset as usize;
            out[base + po] = positions[s];
            out[base + po + 1] = positions[s + 1];
            out[base + po + 2] = positions[s + 2];
        }
        if normal_offset >= 0 {
            let no = normal_offset as usize;
            out[base + no] = normals[s];
            out[base + no + 1] = normals[s + 1];
            out[base + no + 2] = normals[s + 2];
        }
    }
    return out;
}

fn as_u8_slice<T>(data: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            data.as_ptr() as *const u8,
            data.len() * std::mem::size_of::<T>(),
        )
    }
}

pub fn destroy_gl_mesh_upload(state: &GlRenderState, upload: &GlMeshUpload) {
    unsafe {
        state.gl.delete_vertex_array(upload.vertex_array);
        state.gl.delete_buffer(upload.vertex_buffer);
        state.gl.delete_buffer(upload.index_buffer);
    }
}

pub fn ensure_gl_mesh_upload<R>(
    state: &GlRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: bool,
    f: impl FnOnce(&GlMeshUpload) -> R,
) -> R {
    let id = get_entity_id(geometry);
    let primitive_mode = get_gl_primitive_mode(geometry.topology);

    let morphed = get_mesh_geometry_morph_bind_pose(geometry).is_some();
    let bind_pose = if gpu_skinned && !morphed {
        get_mesh_geometry_skin_bind_pose(geometry)
    } else {
        None
    };

    let cached = get_gl_scene3d_runtime(state, |rt| {
        if let Some(upload) = rt.upload_cache.get(&id) {
            if bind_pose.is_some() {
                if upload.skin_bind_uploaded {
                    return Some(upload.clone());
                }
            } else if upload.version == geometry.version {
                return Some(upload.clone());
            }
        }
        return None;
    });

    if let Some(mut upload) = cached {
        upload.primitive_mode = primitive_mode;
        let gl = &state.gl;
        unsafe {
            gl.bind_vertex_array(Some(upload.vertex_array));
        }
        let result = f(&upload);
        get_gl_scene3d_runtime_mut(state, |rt| {
            rt.upload_cache.insert(id, upload);
        });
        return result;
    }

    let gl = &state.gl;
    let (vao, vbo) = unsafe {
        let vao = gl.create_vertex_array().unwrap();
        let vbo = gl.create_buffer().unwrap();
        (vao, vbo)
    };

    unsafe {
        gl.bind_vertex_array(Some(vao));
    }

    let vertices_data: Vec<f32> = if let Some(ref bp) = bind_pose {
        build_skin_bind_vertices(geometry, bp)
    } else {
        geometry.vertices.to_vec()
    };

    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vbo));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, as_u8_slice(&vertices_data), glow::STATIC_DRAW);
    }

    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride;
    for attr in &layout.attributes {
        bind_gl_vertex_attribute(gl, attr, stride);
    }
    let layout_clone = layout.clone();
    drop(layout);

    let (ibo, index_count, index_type) = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data }) => {
            let data = data.read().unwrap();
            let ibo = unsafe { gl.create_buffer().unwrap() };
            unsafe {
                gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(ibo));
                gl.buffer_data_u8_slice(glow::ELEMENT_ARRAY_BUFFER, as_u8_slice(&data), glow::STATIC_DRAW);
            }
            (ibo, data.len() as u32, glow::UNSIGNED_SHORT)
        }
        IndexBuffer::U32(IndexBufferU32 { data }) => {
            let data = data.read().unwrap();
            let ibo = unsafe { gl.create_buffer().unwrap() };
            unsafe {
                gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(ibo));
                gl.buffer_data_u8_slice(glow::ELEMENT_ARRAY_BUFFER, as_u8_slice(&data), glow::STATIC_DRAW);
            }
            (ibo, data.len() as u32, glow::UNSIGNED_INT)
        }
        IndexBuffer::None => {
            let count = if stride > 0 {
                (geometry.vertices.len() as u32 * 4) / stride
            } else {
                0
            };
            let ibo = unsafe { gl.create_buffer().unwrap() };
            (ibo, count, glow::UNSIGNED_SHORT)
        }
    };

    let upload = GlMeshUpload {
        vertex_array: vao,
        vertex_buffer: vbo,
        index_buffer: ibo,
        vertex_count: index_count,
        index_count,
        index_type,
        primitive_mode,
        layout: layout_clone,
        version: geometry.version,
        skin_bind_uploaded: bind_pose.is_some(),
    };

    let result = f(&upload);
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.upload_cache.insert(id, upload);
    });
    return result;
}
