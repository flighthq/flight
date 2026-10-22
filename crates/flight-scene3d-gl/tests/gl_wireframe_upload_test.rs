use std::sync::{Arc, RwLock};

use flight_meshgeometry::{
    IndexBuffer, IndexBufferU16, MeshGeometryOptions, VertexAttribute, VertexAttributeLayout,
    VertexFormat, VertexSemantic, create_box_mesh_geometry, create_mesh_geometry,
};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{calls_with, count_calls, make_gl_scene3d_state};

mod destroy_gl_wireframe_upload {
    use super::*;

    #[test]
    fn deletes_the_vao_and_the_line_index_buffer_but_not_the_shared_vertex_buffer() {
        let state = make_gl_scene3d_state();
        let upload =
            ensure_gl_wireframe_upload(&state, &create_box_mesh_geometry(None, None, None), None);
        let deletes_before = count_calls("delete_buffers");
        destroy_gl_wireframe_upload(&state, &upload);
        // Exactly the line-index buffer is freed here; the interleaved vertex buffer belongs to the
        // triangle mesh upload and is freed by destroy_gl_mesh_upload for that geometry.
        assert_eq!(count_calls("delete_buffers"), deletes_before + 1);
        assert_eq!(count_calls("delete_vertex_arrays"), 1);
        let deleted_buffer = &calls_with("delete_buffers")[0];
        assert_eq!(
            deleted_buffer.integers[0],
            i64::from(upload.line_index_buffer.0.get())
        );
    }
}

mod ensure_gl_wireframe_upload {
    use super::*;

    #[test]
    fn builds_a_line_index_vao_and_uploads_the_derived_line_buffer() {
        let state = make_gl_scene3d_state();
        let geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_gl_wireframe_upload(&state, &geometry, None);
        assert!(upload.vao.0.get() > 0);
        assert!(upload.line_index_buffer.0.get() > 0);
        // The element-array upload holds the derived line list: two indices per triangle edge, six per
        // triangle (independent of the u16/u32 index width).
        let triangle_count = match &geometry.indices {
            IndexBuffer::U16(value) => value.data.read().unwrap().len() / 3,
            IndexBuffer::U32(value) => value.data.read().unwrap().len() / 3,
            IndexBuffer::None => 0,
        } as i64;
        let element_size = if upload.index_type == glow::UNSIGNED_INT {
            4
        } else {
            2
        };
        let line_upload = calls_with("buffer_data").into_iter().find(|call| {
            call.integers[0] == i64::from(glow::ELEMENT_ARRAY_BUFFER)
                && call.integers[1] == triangle_count * 6 * element_size
        });
        assert!(line_upload.is_some());
    }

    #[test]
    fn re_binds_the_cached_vao_without_rebuilding_when_the_version_is_unchanged() {
        let state = make_gl_scene3d_state();
        let geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_gl_wireframe_upload(&state, &geometry, None);
        let builds = count_calls("create_vertex_array");
        let second = ensure_gl_wireframe_upload(&state, &geometry, None);
        assert_eq!(second, first);
        assert_eq!(count_calls("create_vertex_array"), builds);
    }

    #[test]
    fn binds_the_joint_and_weight_attributes_required_by_the_skinned_line_pipeline() {
        let state = make_gl_scene3d_state();
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                },
                VertexAttribute {
                    byte_offset: 12,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Joints0,
                },
                VertexAttribute {
                    byte_offset: 28,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Weights0,
                },
            ],
            stride: 44,
        };
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 {
                data: Arc::new(RwLock::new(vec![0_u16, 1, 2].into_boxed_slice())),
            })),
            layout: Arc::new(RwLock::new(layout)),
            subsets: None,
            topology: None,
            vertices: vec![0.0_f32; 33].into_boxed_slice(),
        });

        ensure_gl_wireframe_upload(&state, &geometry, Some(true));

        let locations: Vec<i64> = calls_with("vertex_attrib_pointer")
            .iter()
            .map(|call| call.integers[0])
            .collect();
        for location in [0, 6, 7] {
            assert!(locations.contains(&location));
        }
    }
}
