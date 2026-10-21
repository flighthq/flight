/// Vertex data format specifiers for interleaved mesh geometry.
///
/// Each variant names a WebGPU-style vertex format: the component type, optional
/// normalization, and the component count. The byte length and component count are
/// derived through the free functions below.

/// The format of a single vertex attribute in the interleaved record.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VertexFormat {
    Float32x2,
    Float32x3,
    Float32x4,
    Uint8x4,
    Uint16x4,
    Unorm8x4,
}

/// The semantic purpose of a vertex attribute.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VertexSemantic {
    Color0,
    Joints0,
    Normal,
    Position,
    Tangent,
    Uv0,
    Uv1,
    Weights0,
}

/// A single attribute within a vertex layout.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VertexAttribute {
    pub byte_offset: u32,
    pub format: VertexFormat,
    pub semantic: VertexSemantic,
}

/// Describes the interleaved vertex record layout: a list of attributes plus the
/// stride (total bytes per vertex).
#[derive(Debug, Clone, PartialEq)]
pub struct VertexAttributeLayout {
    pub attributes: Vec<VertexAttribute>,
    pub stride: u32,
}

impl Default for VertexAttributeLayout {
    fn default() -> Self {
        return VertexAttributeLayout {
            attributes: Vec::new(),
            stride: 0,
        };
    }
}

/// Returns the byte length of one vertex attribute in the given format.
pub fn get_vertex_format_byte_length(format: VertexFormat) -> u32 {
    return match format {
        VertexFormat::Float32x2 => 8,
        VertexFormat::Float32x3 => 12,
        VertexFormat::Float32x4 => 16,
        VertexFormat::Uint16x4 => 8,
        VertexFormat::Uint8x4 | VertexFormat::Unorm8x4 => 4,
    };
}

/// Returns the number of components in the given vertex format.
pub fn get_vertex_format_component_count(format: VertexFormat) -> u32 {
    return match format {
        VertexFormat::Float32x2 => 2,
        VertexFormat::Float32x3 => 3,
        VertexFormat::Float32x4 | VertexFormat::Uint16x4 | VertexFormat::Uint8x4 | VertexFormat::Unorm8x4 => 4,
    };
}

/// Reads a single component from the vertex data at the given byte offset and format.
/// Uses little-endian byte order.
pub fn read_vertex_format_component(
    data: &[u8],
    byte_offset: usize,
    format: VertexFormat,
    component: usize,
) -> f32 {
    return match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => {
            let offset = byte_offset + component * 4;
            let bytes = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
            f32::from_le_bytes(bytes)
        }
        VertexFormat::Uint16x4 => {
            let offset = byte_offset + component * 2;
            let bytes = [data[offset], data[offset + 1]];
            u16::from_le_bytes(bytes) as f32
        }
        VertexFormat::Uint8x4 => {
            data[byte_offset + component] as f32
        }
        VertexFormat::Unorm8x4 => {
            data[byte_offset + component] as f32 / 255.0
        }
    };
}

/// Writes a single component to the vertex data at the given byte offset and format.
/// Uses little-endian byte order. Values are clamped to the representable range for
/// integer formats.
pub fn write_vertex_format_component(
    data: &mut [u8],
    byte_offset: usize,
    format: VertexFormat,
    component: usize,
    value: f32,
) {
    match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => {
            let offset = byte_offset + component * 4;
            let bytes = value.to_le_bytes();
            data[offset] = bytes[0];
            data[offset + 1] = bytes[1];
            data[offset + 2] = bytes[2];
            data[offset + 3] = bytes[3];
        }
        VertexFormat::Uint16x4 => {
            let offset = byte_offset + component * 2;
            let clamped = value.max(0.0).min(0xFFFF as f32).round() as u16;
            let bytes = clamped.to_le_bytes();
            data[offset] = bytes[0];
            data[offset + 1] = bytes[1];
        }
        VertexFormat::Uint8x4 => {
            let clamped = value.max(0.0).min(0xFF as f32).round() as u8;
            data[byte_offset + component] = clamped;
        }
        VertexFormat::Unorm8x4 => {
            let clamped = value.max(0.0).min(1.0) * 255.0;
            data[byte_offset + component] = clamped.round() as u8;
        }
    }
}

/// Returns true if the format is a float32 variant.
pub fn is_float32_format(format: VertexFormat) -> bool {
    return match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => true,
        _ => false,
    };
}
