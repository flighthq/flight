use std::collections::HashMap;

use flight_entity::get_entity_id;
use flight_meshgeometry::{
    IndexBuffer, IndexBufferU16, IndexBufferU32, MeshGeometry, VertexSemantic,
};
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_upload::{bind_gl_vertex_attribute, ensure_gl_mesh_upload};
use crate::types::GlWireframeUpload;

fn as_u8_slice<T>(data: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            data.as_ptr() as *const u8,
            data.len() * std::mem::size_of::<T>(),
        )
    }
}

fn build_line_indices(geometry: &MeshGeometry) -> (Vec<u8>, u32, u32) {
    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride;
    drop(layout);

    let triangle_count = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data }) => {
            let data = data.read().unwrap();
            data.len() / 3
        }
        IndexBuffer::U32(IndexBufferU32 { data }) => {
            let data = data.read().unwrap();
            data.len() / 3
        }
        IndexBuffer::None => {
            if stride > 0 {
                ((geometry.vertices.len() as u32 * 4) / stride / 3) as usize
            } else {
                0
            }
        }
    };

    let line_count = triangle_count * 6;
    let use_u32 = matches!(&geometry.indices, IndexBuffer::U32(_)) || line_count > 65535;

    if use_u32 {
        let mut lines: Vec<u32> = vec![0; line_count];
        for t in 0..triangle_count {
            let base = t * 3;
            let (i0, i1, i2) = get_triangle_indices(geometry, base);
            let out = t * 6;
            lines[out] = i0;
            lines[out + 1] = i1;
            lines[out + 2] = i1;
            lines[out + 3] = i2;
            lines[out + 4] = i2;
            lines[out + 5] = i0;
        }
        let bytes = as_u8_slice(&lines).to_vec();
        return (bytes, line_count as u32, glow::UNSIGNED_INT);
    } else {
        let mut lines: Vec<u16> = vec![0; line_count];
        for t in 0..triangle_count {
            let base = t * 3;
            let (i0, i1, i2) = get_triangle_indices(geometry, base);
            let out = t * 6;
            lines[out] = i0 as u16;
            lines[out + 1] = i1 as u16;
            lines[out + 2] = i1 as u16;
            lines[out + 3] = i2 as u16;
            lines[out + 4] = i2 as u16;
            lines[out + 5] = i0 as u16;
        }
        let bytes = as_u8_slice(&lines).to_vec();
        return (bytes, line_count as u32, glow::UNSIGNED_SHORT);
    }
}

fn get_triangle_indices(geometry: &MeshGeometry, base: usize) -> (u32, u32, u32) {
    return match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data }) => {
            let data = data.read().unwrap();
            (data[base] as u32, data[base + 1] as u32, data[base + 2] as u32)
        }
        IndexBuffer::U32(IndexBufferU32 { data }) => {
            let data = data.read().unwrap();
            (data[base], data[base + 1], data[base + 2])
        }
        IndexBuffer::None => (base as u32, (base + 1) as u32, (base + 2) as u32),
    };
}

thread_local! {
    static WIREFRAME_UPLOADS: std::cell::RefCell<HashMap<u64, HashMap<u64, GlWireframeUpload>>> =
        std::cell::RefCell::new(HashMap::new());
}

pub fn destroy_gl_wireframe_upload(state: &GlRenderState, upload: &GlWireframeUpload) {
    unsafe {
        state.gl.delete_vertex_array(upload.vertex_array);
        state.gl.delete_buffer(upload.index_buffer);
    }
}

pub fn ensure_gl_wireframe_upload<R>(
    state: &GlRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: bool,
    f: impl FnOnce(&GlWireframeUpload) -> R,
) -> R {
    let state_id = get_entity_id(state);
    let geo_id = get_entity_id(geometry);

    ensure_gl_mesh_upload(state, geometry, gpu_skinned, |mesh_upload| {
        let cached = WIREFRAME_UPLOADS.with(|uploads| {
            let map = uploads.borrow();
            if let Some(per_state) = map.get(&state_id) {
                if let Some(upload) = per_state.get(&geo_id) {
                    if upload.version == geometry.version {
                        return Some(upload.clone());
                    }
                }
            }
            return None;
        });

        if let Some(upload) = cached {
            let gl = &state.gl;
            unsafe {
                gl.bind_vertex_array(Some(upload.vertex_array));
            }
            return f(&upload);
        }

        let gl = &state.gl;
        let (line_bytes, line_count, index_type) = build_line_indices(geometry);

        let vao = unsafe { gl.create_vertex_array().unwrap() };
        unsafe {
            gl.bind_vertex_array(Some(vao));
        }

        unsafe {
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(mesh_upload.vertex_buffer));
        }
        let layout = geometry.layout.read().unwrap();
        let stride = layout.stride;
        for attr in &layout.attributes {
            if attr.semantic == VertexSemantic::Position
                || attr.semantic == VertexSemantic::Joints0
                || attr.semantic == VertexSemantic::Weights0
            {
                bind_gl_vertex_attribute(gl, attr, stride);
            }
        }
        drop(layout);

        let ibo = unsafe { gl.create_buffer().unwrap() };
        unsafe {
            gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(ibo));
            gl.buffer_data_u8_slice(glow::ELEMENT_ARRAY_BUFFER, &line_bytes, glow::STATIC_DRAW);
        }

        let upload = GlWireframeUpload {
            vertex_array: vao,
            vertex_buffer: mesh_upload.vertex_buffer,
            index_buffer: ibo,
            index_type,
            line_count,
            version: geometry.version,
        };

        let result = f(&upload);

        WIREFRAME_UPLOADS.with(|uploads| {
            let mut map = uploads.borrow_mut();
            let per_state = map.entry(state_id).or_insert_with(HashMap::new);
            per_state.insert(geo_id, upload);
        });

        return result;
    })
}
