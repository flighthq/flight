//! Lazy GPU upload of a `MeshGeometry` into a VAO for one `GlRenderState`.
//!
//! Ports `@flighthq/scene-gl` `glMeshUpload.ts`. Caches the upload keyed by the
//! geometry's stable id (the per-state parallel of `MeshGeometryRuntime.webglData`).
//! Re-uploads when `geometry.version` moves past the cached version, reusing the
//! existing GL objects. The VAO binds only the canonical PBR attributes the shader
//! consumes (position/normal/tangent/uv0), read from `geometry.layout` so a
//! custom-offset layout still works.
//!
//! TS↔Rust divergence: the TS path drives a recording WebGL2 mock; the Rust path
//! drives a real `glow::Context`, so the upload function is not unit-tested without
//! a device (matching `flighthq-render-gl`). The pure attribute-location and
//! vertex-format resolution are factored out and assertion-tested.

use flighthq_render_gl::{GlRenderState, bytemuck_f32, bytemuck_u16, bytemuck_u32};
use flighthq_types::mesh::{
    MeshGeometry, MeshIndices, VertexAttribute, VertexFormat, VertexSemantic,
};
use glow::HasContext;

use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// Lazily uploads a `MeshGeometry`'s interleaved vertex buffer + index buffer into
/// a VAO for this state, caching the result keyed by `geometry_id`. Leaves the VAO
/// bound on return (the draw path issues its draws immediately after).
///
/// # Safety
/// The GL context must be current.
pub fn ensure_gl_mesh_upload<'a>(
    state: &GlRenderState,
    scene: &'a mut GlSceneRuntime,
    geometry_id: u64,
    geometry: &MeshGeometry,
) -> &'a GlMeshUpload {
    let gl = &state.gl;
    let version = geometry.version as i64;

    let exists_current = scene
        .upload_cache
        .get(&geometry_id)
        .is_some_and(|u| u.version == version && u.vao.is_some());

    if exists_current {
        let upload = &scene.upload_cache[&geometry_id];
        unsafe {
            gl.bind_vertex_array(upload.vao);
        }
        return upload;
    }

    unsafe {
        let entry = scene.upload_cache.entry(geometry_id).or_default();
        if entry.vao.is_none() {
            entry.vao = Some(gl.create_vertex_array().expect("create mesh VAO"));
            entry.vertex_buffer = Some(gl.create_buffer().expect("create mesh vertex buffer"));
            entry.version = -1;
            entry.index_type = glow::UNSIGNED_SHORT;
        }

        gl.bind_vertex_array(entry.vao);

        gl.bind_buffer(glow::ARRAY_BUFFER, entry.vertex_buffer);
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            bytemuck_f32(&geometry.vertices),
            glow::STATIC_DRAW,
        );

        let stride = geometry.layout.stride;
        for attribute in &geometry.layout.attributes {
            bind_gl_vertex_attribute(gl, attribute, stride);
        }

        match &geometry.indices {
            Some(indices) => {
                if entry.index_buffer.is_none() {
                    entry.index_buffer =
                        Some(gl.create_buffer().expect("create mesh index buffer"));
                }
                gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, entry.index_buffer);
                match indices {
                    MeshIndices::U16(v) => {
                        gl.buffer_data_u8_slice(
                            glow::ELEMENT_ARRAY_BUFFER,
                            bytemuck_u16(v),
                            glow::STATIC_DRAW,
                        );
                        entry.index_type = glow::UNSIGNED_SHORT;
                        entry.index_count = v.len() as u32;
                    }
                    MeshIndices::U32(v) => {
                        gl.buffer_data_u8_slice(
                            glow::ELEMENT_ARRAY_BUFFER,
                            bytemuck_u32(v),
                            glow::STATIC_DRAW,
                        );
                        entry.index_type = glow::UNSIGNED_INT;
                        entry.index_count = v.len() as u32;
                    }
                }
            }
            None => {
                entry.index_buffer = None;
                entry.index_count = 0;
            }
        }

        entry.version = version;
    }

    &scene.upload_cache[&geometry_id]
}

/// Vertex attribute location the mesh vertex shaders fix with `layout(location =
/// …)`; the upload's VAO wires the interleaved buffer to these by semantic.
/// Locations 0–3 are the canonical PBR record (position/normal/tangent/uv0);
/// `color0` (location 4) is bound only when a geometry's layout carries it (the
/// VertexColor path); `uv1` (location 5) is the second UV set (occlusion/lightmap
/// channel per glTF TEXCOORD_1); `joints0`/`weights0` (locations 6–7) are the
/// skinning channels (reserved for a future GPU-skinning pass). Returns `None` for
/// a semantic absent from this map, which is left unbound.
pub fn gl_pbr_attribute_location(semantic: VertexSemantic) -> Option<u32> {
    match semantic {
        VertexSemantic::Position => Some(0),
        VertexSemantic::Normal => Some(1),
        VertexSemantic::Tangent => Some(2),
        VertexSemantic::Uv0 => Some(3),
        VertexSemantic::Color0 => Some(4),
        VertexSemantic::Uv1 => Some(5),
        VertexSemantic::Joints0 => Some(6),
        VertexSemantic::Weights0 => Some(7),
    }
}

/// Maps a `VertexFormat` to its `(component_count, gl_type, normalized)` tuple. The
/// canonical PBR record is all float32, but the data path may carry packed
/// integer/unorm attributes for later passes.
pub fn resolve_gl_vertex_format(format: VertexFormat) -> (i32, u32, bool) {
    match format {
        VertexFormat::Float32x2 => (2, glow::FLOAT, false),
        VertexFormat::Float32x3 => (3, glow::FLOAT, false),
        VertexFormat::Float32x4 => (4, glow::FLOAT, false),
        VertexFormat::Uint8x4 => (4, glow::UNSIGNED_BYTE, false),
        VertexFormat::Unorm8x4 => (4, glow::UNSIGNED_BYTE, true),
        VertexFormat::Uint16x4 => (4, glow::UNSIGNED_SHORT, false),
    }
}

/// # Safety
/// The GL context must be current and the target VAO bound.
unsafe fn bind_gl_vertex_attribute(gl: &glow::Context, attribute: &VertexAttribute, stride: u32) {
    let Some(location) = gl_pbr_attribute_location(attribute.semantic) else {
        return;
    };
    let (size, gl_type, normalized) = resolve_gl_vertex_format(attribute.format);
    unsafe {
        gl.enable_vertex_attrib_array(location);
        if gl_type == glow::FLOAT {
            gl.vertex_attrib_pointer_f32(
                location,
                size,
                gl_type,
                normalized,
                stride as i32,
                attribute.byte_offset as i32,
            );
        } else {
            gl.vertex_attrib_pointer_i32(
                location,
                size,
                gl_type,
                stride as i32,
                attribute.byte_offset as i32,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // gl_pbr_attribute_location

    #[test]
    fn gl_pbr_attribute_location_maps_the_canonical_pbr_semantics() {
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Position), Some(0));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Normal), Some(1));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Tangent), Some(2));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Uv0), Some(3));
    }

    #[test]
    fn gl_pbr_attribute_location_maps_the_extended_skinning_and_secondary_uv_semantics() {
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Color0), Some(4));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Uv1), Some(5));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Joints0), Some(6));
        assert_eq!(gl_pbr_attribute_location(VertexSemantic::Weights0), Some(7));
    }

    // resolve_gl_vertex_format

    #[test]
    fn resolve_gl_vertex_format_maps_float_formats_to_unnormalized_float_tuples() {
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Float32x2),
            (2, glow::FLOAT, false)
        );
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Float32x3),
            (3, glow::FLOAT, false)
        );
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Float32x4),
            (4, glow::FLOAT, false)
        );
    }

    #[test]
    fn resolve_gl_vertex_format_marks_unorm8x4_normalized_and_uint_formats_not() {
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Unorm8x4),
            (4, glow::UNSIGNED_BYTE, true)
        );
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Uint8x4),
            (4, glow::UNSIGNED_BYTE, false)
        );
        assert_eq!(
            resolve_gl_vertex_format(VertexFormat::Uint16x4),
            (4, glow::UNSIGNED_SHORT, false)
        );
    }
}
