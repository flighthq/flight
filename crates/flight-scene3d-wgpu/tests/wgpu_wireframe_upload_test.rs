use std::sync::{Arc, RwLock};

use flight_meshgeometry::{
    IndexBuffer, MeshGeometry, MeshGeometryOptions, VertexAttribute, VertexAttributeLayout,
    VertexFormat, VertexSemantic, create_box_mesh_geometry, create_mesh_geometry,
};
use flight_render_wgpu::WgpuSkinningAdapter;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn upload_whole_geometry(geometry: &MeshGeometry) -> Option<Vec<f32>> {
    return Some(geometry.vertices.to_vec());
}

fn always_has_bind_pose(_geometry: &MeshGeometry) -> bool {
    return true;
}

// The source's spread of the adapter with a bind pose that always uploads.
static BIND_POSE_ADAPTER: WgpuSkinningAdapter = WgpuSkinningAdapter {
    get_upload_vertices: upload_whole_geometry,
    has_bind_pose: always_has_bind_pose,
    ..WGPU_SKINNING_ADAPTER
};

fn has_index_buffer_of_size(test: &WgpuScene3DTestState, size: u64) -> bool {
    return test
        .buffers()
        .iter()
        .any(|buffer| buffer.usage.contains(wgpu::BufferUsages::INDEX) && buffer.size == size);
}

mod ensure_wgpu_wireframe_upload {
    use super::*;

    #[test]
    fn builds_a_line_index_buffer_sized_two_indices_per_triangle_edge() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, None).unwrap();
        let triangle_count = match &geometry.indices {
            IndexBuffer::U16(indices) => indices.data.read().unwrap().len() / 3,
            IndexBuffer::U32(indices) => indices.data.read().unwrap().len() / 3,
            IndexBuffer::None => 0,
        };
        let bytes_per_index = if upload.index_format == wgpu::IndexFormat::Uint32 {
            4
        } else {
            2
        };
        assert!(has_index_buffer_of_size(
            &test,
            (triangle_count * 6 * bytes_per_index) as u64
        ));
    }

    // Non-indexed geometry derives its edges from a sequential vertex range.
    #[test]
    fn derives_line_indices_from_a_sequential_range_for_non_indexed_geometry() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 18].into_boxed_slice(),
            layout: Arc::new(RwLock::new(VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            })),
            indices: None,
            subsets: None,
            topology: None,
        });

        let upload = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, None);

        assert!(upload.is_some());
        // 2 triangles x 6 line indices x 2 bytes.
        assert!(has_index_buffer_of_size(&test, 2 * 6 * 2));
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(
            &bytes_to_u16(&write.data)[..12],
            &[0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3]
        );
    }

    #[test]
    fn returns_the_cached_upload_without_rebuilding_when_the_version_is_unchanged() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, None).unwrap();
        let buffers = test.count("createBuffer");
        let second = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, None).unwrap();
        assert_eq!(second.line_index_buffer, first.line_index_buffer);
        assert_eq!(test.count("createBuffer"), buffers);
    }

    #[test]
    fn refreshes_its_vertex_buffer_reference_when_a_skinned_upload_replaces_the_rigid_one() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let rigid = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, None).unwrap();
        get_wgpu_scene3d_runtime(&mut test.state).skinning_adapter = Some(&BIND_POSE_ADAPTER);

        let skinned = ensure_wgpu_wireframe_upload(&mut test.state, &geometry, Some(true)).unwrap();

        assert_ne!(skinned.vertex_buffer, rigid.vertex_buffer);
    }
}
