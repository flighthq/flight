use flight_entity::get_entity_id;
use flight_meshgeometry::{IndexBuffer, MeshGeometry};
use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::WgpuMeshUpload;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime_mut;

pub fn ensure_wgpu_mesh_upload<R>(
    state: &WgpuRenderState,
    geometry: &MeshGeometry,
    f: impl FnOnce(&WgpuMeshUpload) -> R,
) -> R {
    let geom_id = get_entity_id(geometry);
    return get_wgpu_scene3d_runtime_mut(state, |rt| {
        let needs_upload = match rt.upload_cache.get(&geom_id) {
            Some(upload) if upload.version == geometry.version => false,
            _ => true,
        };
        if needs_upload {
            let upload = create_mesh_upload(state, geometry);
            rt.upload_cache.insert(geom_id, upload);
        }
        return f(rt.upload_cache.get(&geom_id).unwrap());
    });
}

fn create_mesh_upload(state: &WgpuRenderState, geometry: &MeshGeometry) -> WgpuMeshUpload {
    let native = get_wgpu_render_state_native_device(state);
    let vertices = &geometry.vertices;
    let vertex_bytes = f32_as_bytes(vertices);

    let vertex_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: align_to_4(vertex_bytes.len()) as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    native.queue.write_buffer(&vertex_buffer, 0, vertex_bytes);

    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride;

    let (index_buffer, index_format, vertex_count) = match &geometry.indices {
        IndexBuffer::U16(idx) => {
            let data = idx.data.read().unwrap();
            let bytes = u16_as_bytes(&data);
            let padded = align_to_4(bytes.len());
            let buf = native.device.create_buffer(&wgpu::BufferDescriptor {
                label: None,
                size: padded as u64,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            write_index_bytes_padded(&native.queue, &buf, bytes, padded);
            (Some(buf), Some(wgpu::IndexFormat::Uint16), data.len() as u32)
        }
        IndexBuffer::U32(idx) => {
            let data = idx.data.read().unwrap();
            let bytes = u32_as_bytes(&data);
            let buf = native.device.create_buffer(&wgpu::BufferDescriptor {
                label: None,
                size: align_to_4(bytes.len()) as u64,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            native.queue.write_buffer(&buf, 0, bytes);
            (Some(buf), Some(wgpu::IndexFormat::Uint32), data.len() as u32)
        }
        IndexBuffer::None => {
            let count = if stride > 0 {
                (vertex_bytes.len() / stride as usize) as u32
            } else {
                0
            };
            (None, None, count)
        }
    };

    return WgpuMeshUpload {
        index_buffer,
        index_format,
        vertex_buffer,
        vertex_count,
        version: geometry.version,
    };
}

fn align_to_4(byte_length: usize) -> usize {
    return (byte_length + 3) & !3;
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

fn u16_as_bytes(data: &[u16]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

fn u32_as_bytes(data: &[u32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

fn write_index_bytes_padded(queue: &wgpu::Queue, buf: &wgpu::Buffer, bytes: &[u8], padded: usize) {
    if bytes.len() == padded {
        queue.write_buffer(buf, 0, bytes);
    } else {
        let mut padded_vec = vec![0u8; padded];
        padded_vec[..bytes.len()].copy_from_slice(bytes);
        queue.write_buffer(buf, 0, &padded_vec);
    }
}
