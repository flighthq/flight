use crate::MeshGeometry;
use crate::VertexAttribute;
use crate::VertexAttributeLayout;
use crate::VertexFormat;
use crate::VertexSemantic;
use crate::get_vertex_format_byte_length;
use crate::get_vertex_format_component_count;
use crate::is_float32_format;
use crate::read_vertex_format_component;
use crate::write_vertex_format_component;
pub use flight_geometry::{Vector2, Vector3, Vector4};

fn get_attribute_byte_offset(
    geometry: &MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
) -> i64 {
    let attribute = match get_vertex_attribute(&geometry.layout.read().unwrap(), semantic).copied()
    {
        Some(attr) => attr,
        None => {
            return -1;
        }
    };
    if geometry.layout.read().unwrap().stride == 0 {
        return -1;
    }
    let attribute_byte_length = get_vertex_format_byte_length(attribute.format);
    if attribute_byte_length == 0 {
        return -1;
    }
    if attribute.byte_offset + attribute_byte_length > geometry.layout.read().unwrap().stride {
        return -1;
    }
    let byte_length = geometry.vertices.len() as u32 * 4;
    let vertex_count = byte_length / geometry.layout.read().unwrap().stride;
    if vertex_index >= vertex_count {
        return -1;
    }
    let byte_offset = vertex_index * geometry.layout.read().unwrap().stride + attribute.byte_offset;
    if byte_offset + attribute_byte_length > byte_length {
        return -1;
    }
    return byte_offset as i64;
}

fn get_float2_attribute(
    out: &mut Vector2,
    geometry: &MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
) -> bool {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), semantic);
    if float_offset < 0 {
        return false;
    }
    let attribute = get_vertex_attribute(&geometry.layout.read().unwrap(), semantic).copied();
    match attribute {
        Some(attr) if attr.format == VertexFormat::Float32x2 => {}
        _ => {
            return false;
        }
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    out.x = geometry.vertices[base];
    out.y = geometry.vertices[base + 1];
    return true;
}

fn get_float3_attribute(
    out: &mut Vector3,
    geometry: &MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
) -> bool {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), semantic);
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    out.x = geometry.vertices[base];
    out.y = geometry.vertices[base + 1];
    out.z = geometry.vertices[base + 2];
    return true;
}

fn get_four_component_attribute(
    out: &mut Vector4,
    geometry: &MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
    allow_float3: bool,
) -> bool {
    let attribute = match get_vertex_attribute(&geometry.layout.read().unwrap(), semantic).copied()
    {
        Some(attr) => attr,
        None => {
            return false;
        }
    };
    let byte_offset = get_attribute_byte_offset(geometry, vertex_index, semantic);
    if byte_offset < 0 {
        return false;
    }
    let byte_offset = byte_offset as usize;
    let component_count = get_vertex_format_component_count(attribute.format);
    if component_count != 4 && !(allow_float3 && attribute.format == VertexFormat::Float32x3) {
        return false;
    }
    let data = vertices_as_bytes(&geometry.vertices);
    let x = read_vertex_format_component(data, byte_offset, attribute.format, 0);
    let y = read_vertex_format_component(data, byte_offset, attribute.format, 1);
    let z = read_vertex_format_component(data, byte_offset, attribute.format, 2);
    let w = if component_count == 4 {
        read_vertex_format_component(data, byte_offset, attribute.format, 3)
    } else {
        1.0
    };
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
    return true;
}

/// Reads the primary vertex color into `out`. Returns false when absent or out of range.
pub fn get_mesh_geometry_vertex_color0(
    out: &mut Vector4,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_four_component_attribute(out, geometry, vertex_index, VertexSemantic::Color0, true);
}

/// Reads the four primary joint indices. Returns false when absent or out of range.
pub fn get_mesh_geometry_vertex_joints0(
    out: &mut Vector4,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_four_component_attribute(
        out,
        geometry,
        vertex_index,
        VertexSemantic::Joints0,
        false,
    );
}

/// Reads the normal (x, y, z) of vertex `vertex_index` into `out`. Returns false when
/// absent or out of range.
pub fn get_mesh_geometry_vertex_normal(
    out: &mut Vector3,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_float3_attribute(out, geometry, vertex_index, VertexSemantic::Normal);
}

/// Reads the position (x, y, z) of vertex `vertex_index` into `out`. Returns false when
/// absent or out of range.
pub fn get_mesh_geometry_vertex_position(
    out: &mut Vector3,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_float3_attribute(out, geometry, vertex_index, VertexSemantic::Position);
}

/// Reads the tangent (x, y, z, w) of vertex `vertex_index` into `out`. Returns false when
/// absent or out of range.
pub fn get_mesh_geometry_vertex_tangent(
    out: &mut Vector4,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    let float_offset = get_vertex_attribute_float_offset(
        &geometry.layout.read().unwrap(),
        VertexSemantic::Tangent,
    );
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    out.x = geometry.vertices[base];
    out.y = geometry.vertices[base + 1];
    out.z = geometry.vertices[base + 2];
    out.w = geometry.vertices[base + 3];
    return true;
}

/// Reads the uv0 (u, v) of vertex `vertex_index` into `out`. Returns false when absent
/// or out of range.
pub fn get_mesh_geometry_vertex_uv0(
    out: &mut Vector2,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), VertexSemantic::Uv0);
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    out.x = geometry.vertices[base];
    out.y = geometry.vertices[base + 1];
    return true;
}

/// Reads the secondary texture coordinate channel.
pub fn get_mesh_geometry_vertex_uv1(
    out: &mut Vector2,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_float2_attribute(out, geometry, vertex_index, VertexSemantic::Uv1);
}

/// Reads the four primary skin weights.
pub fn get_mesh_geometry_vertex_weights0(
    out: &mut Vector4,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    return get_four_component_attribute(
        out,
        geometry,
        vertex_index,
        VertexSemantic::Weights0,
        false,
    );
}

/// Returns the VertexAttribute for the given semantic, or None if absent.
pub fn get_vertex_attribute(
    layout: &VertexAttributeLayout,
    semantic: VertexSemantic,
) -> Option<&VertexAttribute> {
    let attrs = &layout.attributes;
    for i in 0..attrs.len() {
        if attrs[i].semantic == semantic {
            return Some(&attrs[i]);
        }
    }
    return None;
}

/// Returns the float index (byte_offset / 4) within one vertex record for the given
/// semantic, or -1 when the semantic is absent or has a non-float format.
pub fn get_vertex_attribute_float_offset(
    layout: &VertexAttributeLayout,
    semantic: VertexSemantic,
) -> i32 {
    let attrs = &layout.attributes;
    for i in 0..attrs.len() {
        let attr = &attrs[i];
        if attr.semantic == semantic {
            if !is_float32_format(attr.format) {
                return -1;
            }
            return (attr.byte_offset / 4) as i32;
        }
    }
    return -1;
}

fn set_float2_attribute(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
    x: f32,
    y: f32,
) -> bool {
    let attribute = match get_vertex_attribute(&geometry.layout.read().unwrap(), semantic).copied()
    {
        Some(attr) => attr,
        None => {
            return false;
        }
    };
    if attribute.format != VertexFormat::Float32x2 {
        return false;
    }
    let byte_offset = get_attribute_byte_offset(geometry, vertex_index, semantic);
    if byte_offset < 0 {
        return false;
    }
    let byte_offset = byte_offset as usize;
    let data = vertices_as_bytes_mut(&mut geometry.vertices);
    let x_bytes = x.to_le_bytes();
    let y_bytes = y.to_le_bytes();
    data[byte_offset..byte_offset + 4].copy_from_slice(&x_bytes);
    data[byte_offset + 4..byte_offset + 8].copy_from_slice(&y_bytes);
    geometry.version += 1;
    return true;
}

fn set_float3_attribute(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), semantic);
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    geometry.vertices[base] = x;
    geometry.vertices[base + 1] = y;
    geometry.vertices[base + 2] = z;
    geometry.version += 1;
    return true;
}

fn set_four_component_attribute(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
    allow_float3: bool,
) -> bool {
    let attribute = match get_vertex_attribute(&geometry.layout.read().unwrap(), semantic).copied()
    {
        Some(attr) => attr,
        None => {
            return false;
        }
    };
    let byte_offset = get_attribute_byte_offset(geometry, vertex_index, semantic);
    if byte_offset < 0 {
        return false;
    }
    let byte_offset = byte_offset as usize;
    let component_count = get_vertex_format_component_count(attribute.format);
    if component_count != 4 && !(allow_float3 && attribute.format == VertexFormat::Float32x3) {
        return false;
    }
    let data = vertices_as_bytes_mut(&mut geometry.vertices);
    write_vertex_format_component(data, byte_offset, attribute.format, 0, x);
    write_vertex_format_component(data, byte_offset, attribute.format, 1, y);
    write_vertex_format_component(data, byte_offset, attribute.format, 2, z);
    if component_count == 4 {
        write_vertex_format_component(data, byte_offset, attribute.format, 3, w);
    }
    geometry.version += 1;
    return true;
}

/// Writes color0 through its declared storage format. Bumps geometry.version on success.
pub fn set_mesh_geometry_vertex_color0(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> bool {
    return set_four_component_attribute(
        geometry,
        vertex_index,
        VertexSemantic::Color0,
        r,
        g,
        b,
        a,
        true,
    );
}

/// Writes the four primary joint indices.
pub fn set_mesh_geometry_vertex_joints0(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) -> bool {
    return set_four_component_attribute(
        geometry,
        vertex_index,
        VertexSemantic::Joints0,
        x,
        y,
        z,
        w,
        false,
    );
}

/// Writes the normal (x, y, z) for vertex `vertex_index`. Bumps geometry.version.
pub fn set_mesh_geometry_vertex_normal(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    return set_float3_attribute(geometry, vertex_index, VertexSemantic::Normal, x, y, z);
}

/// Writes the position (x, y, z) for vertex `vertex_index`. Bumps geometry.version.
pub fn set_mesh_geometry_vertex_position(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    return set_float3_attribute(geometry, vertex_index, VertexSemantic::Position, x, y, z);
}

/// Writes the tangent (x, y, z, w) for vertex `vertex_index`. Bumps geometry.version.
pub fn set_mesh_geometry_vertex_tangent(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) -> bool {
    let float_offset = get_vertex_attribute_float_offset(
        &geometry.layout.read().unwrap(),
        VertexSemantic::Tangent,
    );
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    geometry.vertices[base] = x;
    geometry.vertices[base + 1] = y;
    geometry.vertices[base + 2] = z;
    geometry.vertices[base + 3] = w;
    geometry.version += 1;
    return true;
}

/// Writes the uv0 (u, v) for vertex `vertex_index`. Bumps geometry.version.
pub fn set_mesh_geometry_vertex_uv0(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    u: f32,
    v: f32,
) -> bool {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), VertexSemantic::Uv0);
    if float_offset < 0 {
        return false;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset as u32) as usize;
    geometry.vertices[base] = u;
    geometry.vertices[base + 1] = v;
    geometry.version += 1;
    return true;
}

/// Writes the secondary texture coordinate channel.
pub fn set_mesh_geometry_vertex_uv1(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    u: f32,
    v: f32,
) -> bool {
    return set_float2_attribute(geometry, vertex_index, VertexSemantic::Uv1, u, v);
}

/// Writes the four primary skin weights.
pub fn set_mesh_geometry_vertex_weights0(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) -> bool {
    return set_four_component_attribute(
        geometry,
        vertex_index,
        VertexSemantic::Weights0,
        x,
        y,
        z,
        w,
        false,
    );
}

/// Reinterprets a slice of f32 as a slice of u8 (read-only). This is the Rust equivalent
/// of constructing a DataView over the same ArrayBuffer in TS.
pub(crate) fn vertices_as_bytes(vertices: &[f32]) -> &[u8] {
    let ptr = vertices.as_ptr() as *const u8;
    let len = vertices.len() * 4;
    return unsafe { std::slice::from_raw_parts(ptr, len) };
}

/// Reinterprets a mutable slice of f32 as a mutable slice of u8.
pub(crate) fn vertices_as_bytes_mut(vertices: &mut [f32]) -> &mut [u8] {
    let ptr = vertices.as_mut_ptr() as *mut u8;
    let len = vertices.len() * 4;
    return unsafe { std::slice::from_raw_parts_mut(ptr, len) };
}
