use crate::IndexBufferU16;
use crate::IndexBufferU32;
use crate::MeshGeometry;
use crate::MeshGeometryOptions;
use crate::VertexAttribute;
use crate::VertexAttributeLayout;
use crate::VertexFormat;
use crate::VertexSemantic;
use crate::create_mesh_geometry;
use crate::get_vertex_format_byte_length;
use crate::get_vertex_format_component_count;
use crate::read_vertex_format_component;
use crate::vertices_as_bytes;
use crate::write_vertex_format_component;

use crate::IndexBuffer;

struct AttributeMapping {
    source: VertexAttribute,
    destination: VertexAttribute,
    source_byte_length: u32,
}

/// The canonical interleaved PBR vertex layout used by every built-in primitive builder:
///   position(3) + normal(3) + tangent(4, w = glTF handedness) + uv0(2) = 12 floats / 48 bytes.
pub static CANONICAL_MESH_GEOMETRY_LAYOUT: std::sync::LazyLock<
    flight_entity::Ref<VertexAttributeLayout>,
> = std::sync::LazyLock::new(|| {
    return std::sync::Arc::new(std::sync::RwLock::new(VertexAttributeLayout {
        attributes: vec![
            VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            },
            VertexAttribute {
                byte_offset: 12,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Normal,
            },
            VertexAttribute {
                byte_offset: 24,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Tangent,
            },
            VertexAttribute {
                byte_offset: 40,
                format: VertexFormat::Float32x2,
                semantic: VertexSemantic::Uv0,
            },
        ],
        stride: 48,
    }));
});

/// The canonical interleaved skinned-mesh layout: the PBR record extended with
/// joints0 (float32x4) and weights0 (float32x4) for 20 floats / 80 bytes.
pub static CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT: std::sync::LazyLock<
    flight_entity::Ref<VertexAttributeLayout>,
> = std::sync::LazyLock::new(|| {
    return std::sync::Arc::new(std::sync::RwLock::new(VertexAttributeLayout {
        attributes: vec![
            VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            },
            VertexAttribute {
                byte_offset: 12,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Normal,
            },
            VertexAttribute {
                byte_offset: 24,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Tangent,
            },
            VertexAttribute {
                byte_offset: 40,
                format: VertexFormat::Float32x2,
                semantic: VertexSemantic::Uv0,
            },
            VertexAttribute {
                byte_offset: 48,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Joints0,
            },
            VertexAttribute {
                byte_offset: 64,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Weights0,
            },
        ],
        stride: 80,
    }));
});

fn bytes_to_f32_vec(bytes: &[u8]) -> Vec<f32> {
    let count = bytes.len() / 4;
    let mut result = vec![0.0f32; count];
    for i in 0..count {
        let offset = i * 4;
        let b = [
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ];
        result[i] = f32::from_le_bytes(b);
    }
    return result;
}

/// Re-packs a geometry's interleaved vertex stream into a new layout. Attributes present
/// in both layouts are copied by semantic; absent attributes are zero-filled. Returns a
/// new MeshGeometry. Bounds are set to None.
pub fn convert_mesh_geometry_layout(
    source: &MeshGeometry,
    target_layout: &flight_entity::Ref<VertexAttributeLayout>,
) -> MeshGeometry {
    let src_stride = source.layout.read().unwrap().stride;
    let dst_stride = target_layout.read().unwrap().stride;
    let vertex_count = if src_stride > 0 {
        (source.vertices.len() as u32 * 4) / src_stride
    } else {
        0
    };
    let dst_float_count = (vertex_count * dst_stride / 4) as usize;
    let mut dst_vertices = vec![0.0f32; dst_float_count];

    let source_bytes = vertices_as_bytes(&source.vertices);
    let mut dst_bytes_buf = vec![0u8; dst_float_count * 4];

    // Build attribute mappings
    let mut mappings: Vec<AttributeMapping> = Vec::new();
    for dst_attr in &target_layout.read().unwrap().attributes {
        let source_layout = source.layout.read().unwrap();
        let src_attr = source_layout
            .attributes
            .iter()
            .find(|a| a.semantic == dst_attr.semantic);
        let src_attr = match src_attr {
            Some(a) => a,
            None => {
                continue;
            }
        };
        let source_byte_length = get_vertex_format_byte_length(src_attr.format);
        let destination_byte_length = get_vertex_format_byte_length(dst_attr.format);
        if source_byte_length == 0 || destination_byte_length == 0 {
            continue;
        }
        if src_attr.byte_offset + source_byte_length > src_stride {
            continue;
        }
        if dst_attr.byte_offset + destination_byte_length > dst_stride {
            continue;
        }
        mappings.push(AttributeMapping {
            source: *src_attr,
            destination: *dst_attr,
            source_byte_length,
        });
    }

    for vertex in 0..vertex_count {
        for mapping in &mappings {
            let source_offset = (vertex * src_stride + mapping.source.byte_offset) as usize;
            let destination_offset =
                (vertex * dst_stride + mapping.destination.byte_offset) as usize;
            if mapping.source.format == mapping.destination.format {
                let len = mapping.source_byte_length as usize;
                dst_bytes_buf[destination_offset..destination_offset + len]
                    .copy_from_slice(&source_bytes[source_offset..source_offset + len]);
                continue;
            }
            let component_count = std::cmp::min(
                get_vertex_format_component_count(mapping.source.format),
                get_vertex_format_component_count(mapping.destination.format),
            );
            for component in 0..component_count as usize {
                let value = read_vertex_format_component(
                    source_bytes,
                    source_offset,
                    mapping.source.format,
                    component,
                );
                write_vertex_format_component(
                    &mut dst_bytes_buf,
                    destination_offset,
                    mapping.destination.format,
                    component,
                    value,
                );
            }
        }
    }

    // Copy bytes back to f32 vec
    dst_vertices = bytes_to_f32_vec(&dst_bytes_buf);

    let indices = match &source.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            Some(IndexBuffer::U16(IndexBufferU16 {
                data: std::sync::Arc::new(std::sync::RwLock::new((v.clone()).into())),
            }))
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            Some(IndexBuffer::U32(IndexBufferU32 {
                data: std::sync::Arc::new(std::sync::RwLock::new((v.clone()).into())),
            }))
        }
        IndexBuffer::None => None,
    };

    return create_mesh_geometry(MeshGeometryOptions {
        indices,
        layout: target_layout.clone(),
        subsets: Some(source.subsets.clone()),
        topology: Some(source.topology),
        vertices: (dst_vertices).into(),
    });
}
