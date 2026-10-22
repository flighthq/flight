use std::sync::{Arc, RwLock};

use flight_entity::get_entity_id;
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU16, MeshGeometry,
    MeshGeometryOptions, MeshMorph, MeshMorphTarget, MeshSkinBindPose, VertexAttribute,
    VertexAttributeLayout, VertexFormat, VertexSemantic, create_box_mesh_geometry,
    create_mesh_geometry, invalidate_mesh_geometry, set_mesh_geometry_skin_bind_pose,
};
use flight_render_wgpu::*;
use flight_scene3d::{create_mesh, update_mesh_morph};
use flight_scene3d_wgpu::*;

use crate::support::*;

fn position_layout() -> flight_entity::Ref<VertexAttributeLayout> {
    return Arc::new(RwLock::new(VertexAttributeLayout {
        attributes: vec![VertexAttribute {
            byte_offset: 0,
            format: VertexFormat::Float32x3,
            semantic: VertexSemantic::Position,
        }],
        stride: 12,
    }));
}

fn u16_indices(values: &[u16]) -> IndexBuffer {
    return IndexBuffer::U16(IndexBufferU16 {
        data: Arc::new(RwLock::new(values.to_vec().into_boxed_slice())),
    });
}

// The vertex upload is the second-to-last buffer write (the index upload follows it).
fn last_uploaded_vertices(test: &WgpuScene3DTestState) -> Vec<f32> {
    let writes = test.buffer_writes();
    return bytes_to_f32(&writes[writes.len() - 2].data);
}

fn make_skin_bind_pose(positions: [f32; 3]) -> MeshSkinBindPose {
    return MeshSkinBindPose {
        joints: vec![0.0, 0.0, 0.0, 0.0].into_boxed_slice(),
        normals: vec![0.0, 1.0, 0.0].into_boxed_slice(),
        positions: positions.to_vec().into_boxed_slice(),
        skinned_normals: vec![0.0; 3].into_boxed_slice(),
        skinned_positions: vec![0.0; 3].into_boxed_slice(),
        skinned_tangents: Vec::new().into_boxed_slice(),
        tangents: Vec::new().into_boxed_slice(),
        weights: vec![1.0, 0.0, 0.0, 0.0].into_boxed_slice(),
    };
}

fn make_skinned_geometry(vertices: Vec<f32>) -> MeshGeometry {
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: vertices.into_boxed_slice(),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
        indices: Some(u16_indices(&[0, 0, 0])),
        subsets: None,
        topology: None,
    });
}

fn make_morph(weight: f32) -> flight_entity::Ref<MeshMorph> {
    return Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(vec![MeshMorphTarget {
            position_deltas: vec![4.0, 0.0, 0.0].into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }]),
        weights: vec![weight].into_boxed_slice(),
    }));
}

mod ensure_wgpu_mesh_upload {
    use super::*;

    #[test]
    fn uploads_vertex_and_index_buffers_and_caches_by_geometry() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);

        assert!(upload.index_buffer.is_some());
        let index_count = match &geometry.indices {
            IndexBuffer::U16(indices) => indices.data.read().unwrap().len(),
            IndexBuffer::U32(indices) => indices.data.read().unwrap().len(),
            IndexBuffer::None => 0,
        };
        assert_eq!(upload.index_count as usize, index_count);
        assert_eq!(upload.version, geometry.version);
        assert!(test.count("writeBuffer") >= 2);
    }

    #[test]
    fn pads_an_odd_length_uint16_index_upload_to_four_byte_alignment_without_changing_the_index_count() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: position_layout(),
            indices: Some(u16_indices(&[0, 1, 2])),
            subsets: None,
            topology: None,
        });

        let upload = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        let writes = test.buffer_writes();
        let index_write = writes.last().unwrap();

        assert_eq!(index_write.data.len(), 8);
        assert_eq!(&bytes_to_u16(&index_write.data)[..3], &[0, 1, 2]);
        assert_eq!(upload.index_count, 3);
    }

    #[test]
    fn returns_the_cached_upload_without_re_uploading_when_version_is_unchanged() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        let writes_after_first = test.count("writeBuffer");
        let second = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        assert_eq!(second.vertex_buffer, first.vertex_buffer);
        assert_eq!(test.count("writeBuffer"), writes_after_first);
    }

    #[test]
    fn re_uploads_after_direct_geometry_edits_are_invalidated() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        invalidate_mesh_geometry(&mut geometry);
        let second = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        assert_ne!(second.vertex_buffer, first.vertex_buffer);
        assert_eq!(second.version, geometry.version);
    }

    #[test]
    fn uploads_captured_bind_pose_positions_for_a_gpu_skinned_geometry() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_gpu_skinning(&mut test.state);
        let mut vertices = vec![0.0_f32; 20];
        vertices[0] = 9.0;
        let mut geometry = make_skinned_geometry(vertices);
        set_mesh_geometry_skin_bind_pose(
            &mut geometry,
            Some(Arc::new(RwLock::new(make_skin_bind_pose([1.0, 2.0, 3.0])))),
        );

        let upload = ensure_wgpu_mesh_upload(&mut test.state, &geometry, Some(true));
        let uploaded = bytes_to_f32(&test.buffer_writes()[0].data);

        assert_eq!(upload.skin_bind_uploaded, Some(true));
        assert_eq!(&uploaded[..3], &[1.0, 2.0, 3.0]);
        assert_eq!(geometry.vertices[0], 9.0);
    }

    #[test]
    fn re_uploads_morph_blended_vertices_as_weights_change() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 3].into_boxed_slice(),
            layout: position_layout(),
            indices: Some(u16_indices(&[0, 0, 0])),
            subsets: None,
            topology: None,
        });
        let mesh = create_mesh(Arc::new(RwLock::new(geometry)), Arc::new(RwLock::new(Vec::new())));
        let morph = make_morph(1.0);
        mesh.write().unwrap().morph = Some(morph.clone());

        update_mesh_morph(&mesh.read().unwrap());
        {
            let geometry = mesh.read().unwrap().geometry.clone();
            ensure_wgpu_mesh_upload(&mut test.state, &geometry.read().unwrap(), None);
        }
        assert!((last_uploaded_vertices(&test)[0] - 4.0).abs() < 1e-5);

        morph.write().unwrap().weights[0] = 0.5;
        update_mesh_morph(&mesh.read().unwrap());
        {
            let geometry = mesh.read().unwrap().geometry.clone();
            ensure_wgpu_mesh_upload(&mut test.state, &geometry.read().unwrap(), None);
        }
        assert!((last_uploaded_vertices(&test)[0] - 2.0).abs() < 1e-5);
    }

    #[test]
    fn uploads_current_morphed_vertices_instead_of_a_frozen_skin_bind_pose_for_gpu_skinning() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_gpu_skinning(&mut test.state);
        let mut geometry = make_skinned_geometry(vec![0.0; 20]);
        geometry.vertices[0] = 1.0;
        set_mesh_geometry_skin_bind_pose(
            &mut geometry,
            Some(Arc::new(RwLock::new(make_skin_bind_pose([1.0, 0.0, 0.0])))),
        );
        let mesh = create_mesh(Arc::new(RwLock::new(geometry)), Arc::new(RwLock::new(Vec::new())));
        let morph = make_morph(1.0);
        mesh.write().unwrap().morph = Some(morph.clone());

        update_mesh_morph(&mesh.read().unwrap());
        {
            let geometry = mesh.read().unwrap().geometry.clone();
            ensure_wgpu_mesh_upload(&mut test.state, &geometry.read().unwrap(), Some(true));
        }
        assert!((last_uploaded_vertices(&test)[0] - 5.0).abs() < 1e-5);

        morph.write().unwrap().weights[0] = 2.0;
        update_mesh_morph(&mesh.read().unwrap());
        {
            let geometry = mesh.read().unwrap().geometry.clone();
            ensure_wgpu_mesh_upload(&mut test.state, &geometry.read().unwrap(), Some(true));
        }
        assert!((last_uploaded_vertices(&test)[0] - 9.0).abs() < 1e-5);
    }

    // The source mirrors the upload onto MeshGeometryRuntime.webgpuData; Rust keeps the one upload
    // record in the device tier's cache keyed by the geometry, which is the slot that mirror stood for.
    #[test]
    fn mirrors_the_upload_onto_the_geometry_keyed_device_cache() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);
        let cached = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .scene_mesh_upload_cache
            .as_ref()
            .unwrap()
            .get(&get_entity_id(&geometry))
            .cloned()
            .unwrap();
        assert_eq!(cached.vertex_buffer, upload.vertex_buffer);
    }

    // glTF primitives may legitimately omit indices; refusing to upload them made valid meshes vanish.
    #[test]
    fn uploads_non_indexed_geometry_with_the_vertex_count_in_index_count() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: position_layout(),
            indices: None,
            subsets: None,
            topology: None,
        });

        let upload = ensure_wgpu_mesh_upload(&mut test.state, &geometry, None);

        assert!(upload.index_buffer.is_none());
        assert_eq!(upload.index_count, 3);
        let cached = get_wgpu_render_state_runtime(&test.state)
            .context
            .read()
            .unwrap()
            .scene_mesh_upload_cache
            .as_ref()
            .unwrap()
            .get(&get_entity_id(&geometry))
            .cloned()
            .unwrap();
        assert_eq!(cached.vertex_buffer, upload.vertex_buffer);
    }

    #[test]
    fn reports_a_null_index_format_for_non_indexed_geometry() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: position_layout(),
            indices: None,
            subsets: None,
            topology: None,
        });

        assert!(ensure_wgpu_mesh_upload(&mut test.state, &geometry, None).index_format.is_none());
    }

    #[test]
    fn reports_zero_vertices_when_the_layout_has_no_stride_to_divide_by() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: Arc::new(RwLock::new(VertexAttributeLayout {
                attributes: Vec::new(),
                stride: 0,
            })),
            indices: None,
            subsets: None,
            topology: None,
        });

        assert_eq!(ensure_wgpu_mesh_upload(&mut test.state, &geometry, None).index_count, 0);
    }
}
