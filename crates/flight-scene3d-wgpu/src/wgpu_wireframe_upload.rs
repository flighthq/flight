use flight_meshgeometry::{IndexBuffer, MeshGeometry};
use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::WgpuWireframeUpload;

fn align_to_4(byte_length: usize) -> usize {
    return (byte_length + 3) & !3;
}

fn build_line_indices(geometry: &MeshGeometry) -> Vec<usize> {
    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride;
    let triangle_count = match &geometry.indices {
        IndexBuffer::U16(idx) => idx.data.read().unwrap().len() / 3,
        IndexBuffer::U32(idx) => idx.data.read().unwrap().len() / 3,
        IndexBuffer::None => {
            if stride > 0 {
                let vertex_bytes = geometry.vertices.len() * std::mem::size_of::<f32>();
                vertex_bytes / stride as usize / 3
            } else {
                0
            }
        }
    };

    let mut lines = Vec::with_capacity(triangle_count * 6);
    for t in 0..triangle_count {
        let base = t * 3;
        let (i0, i1, i2) = match &geometry.indices {
            IndexBuffer::U16(idx) => {
                let data = idx.data.read().unwrap();
                (data[base] as usize, data[base + 1] as usize, data[base + 2] as usize)
            }
            IndexBuffer::U32(idx) => {
                let data = idx.data.read().unwrap();
                (data[base] as usize, data[base + 1] as usize, data[base + 2] as usize)
            }
            IndexBuffer::None => (base, base + 1, base + 2),
        };
        lines.push(i0);
        lines.push(i1);
        lines.push(i1);
        lines.push(i2);
        lines.push(i2);
        lines.push(i0);
    }
    return lines;
}

pub fn ensure_wgpu_wireframe_upload(
    state: &WgpuRenderState,
    geometry: &MeshGeometry,
) -> Option<WgpuWireframeUpload> {
    let native = get_wgpu_render_state_native_device(state);
    let lines = build_line_indices(geometry);
    if lines.is_empty() {
        return None;
    }

    let is_u32 = matches!(&geometry.indices, IndexBuffer::U32(_)) || lines.len() > 65535;
    let (bytes, index_format) = if is_u32 {
        let u32_lines: Vec<u32> = lines.iter().map(|&x| x as u32).collect();
        (u32_as_bytes_owned(u32_lines), wgpu::IndexFormat::Uint32)
    } else {
        let u16_lines: Vec<u16> = lines.iter().map(|&x| x as u16).collect();
        (u16_as_bytes_owned(u16_lines), wgpu::IndexFormat::Uint16)
    };

    let padded = align_to_4(bytes.len());
    let index_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: padded as u64,
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    if bytes.len() == padded {
        native.queue.write_buffer(&index_buffer, 0, &bytes);
    } else {
        let mut padded_vec = vec![0u8; padded];
        padded_vec[..bytes.len()].copy_from_slice(&bytes);
        native.queue.write_buffer(&index_buffer, 0, &padded_vec);
    }

    return Some(WgpuWireframeUpload {
        vertex_buffer: native.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 4,
            usage: wgpu::BufferUsages::VERTEX,
            mapped_at_creation: false,
        }),
        index_buffer,
        line_count: (lines.len() / 2) as u32,
        version: geometry.version,
    });
}

fn u16_as_bytes_owned(data: Vec<u16>) -> Vec<u8> {
    let len = data.len() * std::mem::size_of::<u16>();
    let ptr = data.as_ptr() as *const u8;
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec();
    std::mem::forget(data);
    return bytes;
}

fn u32_as_bytes_owned(data: Vec<u32>) -> Vec<u8> {
    let len = data.len() * std::mem::size_of::<u32>();
    let ptr = data.as_ptr() as *const u8;
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec();
    std::mem::forget(data);
    return bytes;
}
