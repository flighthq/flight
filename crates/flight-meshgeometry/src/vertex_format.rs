/// Vertex view format specifiers for interleaved mesh geometry.
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

fn checked_component_offset(
    view_len: usize,
    byte_offset: usize,
    format: VertexFormat,
    component: usize,
) -> usize {
    let width = match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => 4,
        VertexFormat::Uint16x4 => 2,
        VertexFormat::Uint8x4 | VertexFormat::Unorm8x4 => 1,
    };
    let offset = component
        .checked_mul(width)
        .and_then(|value| byte_offset.checked_add(value));
    if let Some(offset) = offset {
        if let Some(end) = offset.checked_add(width) {
            if end <= view_len {
                return offset;
            }
        }
    }
    flight_entity::throw_range_error("Offset is outside the bounds of the DataView");
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
        VertexFormat::Float32x4
        | VertexFormat::Uint16x4
        | VertexFormat::Uint8x4
        | VertexFormat::Unorm8x4 => 4,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed VertexFormat union
pub fn get_vertex_format_string(value: VertexFormat) -> &'static str {
    return match value {
        VertexFormat::Float32x2 => "float32x2",
        VertexFormat::Float32x3 => "float32x3",
        VertexFormat::Float32x4 => "float32x4",
        VertexFormat::Uint16x4 => "uint16x4",
        VertexFormat::Uint8x4 => "uint8x4",
        VertexFormat::Unorm8x4 => "unorm8x4",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed VertexSemantic union
pub fn get_vertex_semantic_string(value: VertexSemantic) -> &'static str {
    return match value {
        VertexSemantic::Color0 => "color0",
        VertexSemantic::Joints0 => "joints0",
        VertexSemantic::Normal => "normal",
        VertexSemantic::Position => "position",
        VertexSemantic::Tangent => "tangent",
        VertexSemantic::Uv0 => "uv0",
        VertexSemantic::Uv1 => "uv1",
        VertexSemantic::Weights0 => "weights0",
    };
}

/// Returns true if the format is a float32 variant.
pub(crate) fn is_float32_format(format: VertexFormat) -> bool {
    return match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => true,
        _ => false,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed VertexFormat union
pub fn parse_vertex_format(s: &str) -> Option<VertexFormat> {
    return match s {
        "float32x2" => Some(VertexFormat::Float32x2),
        "float32x3" => Some(VertexFormat::Float32x3),
        "float32x4" => Some(VertexFormat::Float32x4),
        "uint16x4" => Some(VertexFormat::Uint16x4),
        "uint8x4" => Some(VertexFormat::Uint8x4),
        "unorm8x4" => Some(VertexFormat::Unorm8x4),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the source closed VertexSemantic union
pub fn parse_vertex_semantic(s: &str) -> Option<VertexSemantic> {
    return match s {
        "color0" => Some(VertexSemantic::Color0),
        "joints0" => Some(VertexSemantic::Joints0),
        "normal" => Some(VertexSemantic::Normal),
        "position" => Some(VertexSemantic::Position),
        "tangent" => Some(VertexSemantic::Tangent),
        "uv0" => Some(VertexSemantic::Uv0),
        "uv1" => Some(VertexSemantic::Uv1),
        "weights0" => Some(VertexSemantic::Weights0),
        _ => None,
    };
}

/// Reads a single component from the vertex view at the given byte offset and format.
/// Uses little-endian byte order.
pub fn read_vertex_format_component(
    view: &[u8],
    byte_offset: usize,
    format: VertexFormat,
    component: usize,
) -> f32 {
    let offset = checked_component_offset(view.len(), byte_offset, format, component);
    return match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => {
            let bytes = [
                view[offset],
                view[offset + 1],
                view[offset + 2],
                view[offset + 3],
            ];
            f32::from_le_bytes(bytes)
        }
        VertexFormat::Uint16x4 => {
            let bytes = [view[offset], view[offset + 1]];
            u16::from_le_bytes(bytes) as f32
        }
        VertexFormat::Uint8x4 => view[offset] as f32,
        VertexFormat::Unorm8x4 => view[offset] as f32 / 255.0,
    };
}

/// Writes a single component to the vertex view at the given byte offset and format.
/// Uses little-endian byte order. Values are clamped to the representable range for
/// integer formats.
pub fn write_vertex_format_component(
    view: &mut [u8],
    byte_offset: usize,
    format: VertexFormat,
    component: usize,
    value: f32,
) {
    let offset = checked_component_offset(view.len(), byte_offset, format, component);
    match format {
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4 => {
            let bytes = value.to_le_bytes();
            view[offset] = bytes[0];
            view[offset + 1] = bytes[1];
            view[offset + 2] = bytes[2];
            view[offset + 3] = bytes[3];
        }
        VertexFormat::Uint16x4 => {
            let clamped = value.max(0.0).min(0xFFFF as f32).round() as u16;
            let bytes = clamped.to_le_bytes();
            view[offset] = bytes[0];
            view[offset + 1] = bytes[1];
        }
        VertexFormat::Uint8x4 => {
            let clamped = value.max(0.0).min(0xFF as f32).round() as u8;
            view[offset] = clamped;
        }
        VertexFormat::Unorm8x4 => {
            let clamped = value.max(0.0).min(1.0) * 255.0;
            view[offset] = clamped.round() as u8;
        }
    }
}

impl Default for VertexAttributeLayout {
    fn default() -> Self {
        return VertexAttributeLayout {
            attributes: Vec::new(),
            stride: 0,
        };
    }
}
