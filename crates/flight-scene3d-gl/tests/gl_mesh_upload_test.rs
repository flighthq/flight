use std::sync::{Arc, RwLock};

use flight_entity::get_entity_id;
use flight_meshgeometry::{
    IndexBuffer, MeshGeometry, MeshGeometryOptions, MeshMorph, MeshMorphTarget, MeshSkinBindPose,
    PrimitiveTopology, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
    create_box_mesh_geometry, create_mesh_geometry, invalidate_mesh_geometry,
    set_mesh_geometry_skin_bind_pose,
};
use flight_scene3d::{create_mesh, update_mesh_morph};
use flight_scene3d_gl::*;
use glow::HasContext;

use crate::gl_test_helper::{bytes_as_f32, calls_with, make_gl_scene3d_state};

fn position_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![VertexAttribute {
            byte_offset: 0,
            format: VertexFormat::Float32x3,
            semantic: VertexSemantic::Position,
        }],
        stride: 12,
    };
}

fn geometry_from(layout: VertexAttributeLayout, vertices: Vec<f32>) -> MeshGeometry {
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: vertices.into_boxed_slice(),
        layout: Arc::new(RwLock::new(layout)),
        indices: None,
        subsets: None,
        topology: None,
    });
}

fn skin_bind_pose(positions: Vec<f32>, normals: Vec<f32>) -> flight_entity::Ref<MeshSkinBindPose> {
    return Arc::new(RwLock::new(MeshSkinBindPose {
        joints: Box::new([]),
        normals: normals.into_boxed_slice(),
        positions: positions.into_boxed_slice(),
        skinned_normals: Box::new([]),
        skinned_positions: Box::new([]),
        skinned_tangents: Box::new([]),
        tangents: Box::new([]),
        weights: Box::new([]),
    }));
}

fn morph(deltas: Vec<f32>, weight: f32) -> flight_entity::Ref<MeshMorph> {
    return Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(vec![MeshMorphTarget {
            position_deltas: deltas.into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }]),
        weights: vec![weight].into_boxed_slice(),
    }));
}

fn float_buffer_uploads() -> Vec<Vec<f32>> {
    return calls_with("buffer_data")
        .into_iter()
        .filter(|call| call.integers[0] == i64::from(glow::ARRAY_BUFFER))
        .map(|call| bytes_as_f32(&call.bytes))
        .collect();
}

fn last_float32_buffer_data() -> Vec<f32> {
    return float_buffer_uploads().pop().unwrap();
}

mod bind_gl_vertex_attribute {
    use super::*;

    #[test]
    fn binds_normalized_packed_weights_to_the_shader_float_input() {
        let state = make_gl_scene3d_state();

        bind_gl_vertex_attribute(
            &state.gl,
            &VertexAttribute {
                byte_offset: 16,
                format: VertexFormat::Unorm8x4,
                semantic: VertexSemantic::Weights0,
            },
            20,
        );

        assert!(
            calls_with("enable_vertex_attrib_array")
                .iter()
                .any(|call| call.integers[0] == 7)
        );
        let pointer = &calls_with("vertex_attrib_pointer")[0];
        assert_eq!(
            pointer.integers,
            vec![7, 4, i64::from(glow::UNSIGNED_BYTE), 1, 20, 16]
        );
    }
}

mod destroy_gl_mesh_upload {
    use super::*;

    #[test]
    fn deletes_the_vao_and_the_vertex_index_buffers_of_an_indexed_upload() {
        let state = make_gl_scene3d_state();
        let upload = ensure_gl_mesh_upload(&state, &create_box_mesh_geometry(None, None, None), None);
        destroy_gl_mesh_upload(&state, &upload);
        assert_eq!(calls_with("delete_vertex_arrays").len(), 1);
        assert_eq!(calls_with("delete_buffers").len(), 2);
    }

    #[test]
    fn skips_the_index_buffer_when_the_upload_is_non_indexed() {
        let state = make_gl_scene3d_state();
        // SAFETY: the mock context allocates names on the test thread.
        let (vao, vertex_buffer) =
            unsafe { (state.gl.create_vertex_array().unwrap(), state.gl.create_buffer().unwrap()) };
        let upload = GlMeshUpload {
            index_buffer: None,
            index_count: 0,
            index_type: glow::UNSIGNED_SHORT,
            primitive_mode: glow::TRIANGLES,
            skin_bind_uploaded: None,
            vao,
            version: 0,
            vertex_buffer,
        };
        destroy_gl_mesh_upload(&state, &upload);
        assert_eq!(calls_with("delete_vertex_arrays").len(), 1);
        assert_eq!(calls_with("delete_buffers").len(), 1);
    }
}

mod ensure_gl_mesh_upload {
    use super::*;

    #[test]
    fn uploads_vertex_index_buffers_into_a_vao_and_reports_the_indexed_draw_shape() {
        let state = make_gl_scene3d_state();
        let geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_gl_mesh_upload(&state, &geometry, None);

        assert!(upload.index_buffer.is_some());
        let (index_count, expected_type) = match &geometry.indices {
            IndexBuffer::U16(value) => (value.data.read().unwrap().len(), glow::UNSIGNED_SHORT),
            IndexBuffer::U32(value) => (value.data.read().unwrap().len(), glow::UNSIGNED_INT),
            IndexBuffer::None => (0, 0),
        };
        assert_eq!(upload.index_count as usize, index_count);
        assert_eq!(upload.index_type, expected_type);
        assert_eq!(upload.version, i64::from(geometry.version));
        assert_eq!(upload.primitive_mode, glow::TRIANGLES);
        assert!(!calls_with("buffer_data").is_empty());
    }

    #[test]
    fn reports_the_vertex_count_for_a_non_indexed_upload() {
        let state = make_gl_scene3d_state();
        let geometry = geometry_from(position_layout(), vec![0.0; 9]);
        let upload = ensure_gl_mesh_upload(&state, &geometry, None);

        assert!(upload.index_buffer.is_none());
        assert_eq!(upload.index_count, 3);
        assert_eq!(upload.primitive_mode, glow::TRIANGLES);
    }

    #[test]
    fn refreshes_the_primitive_mode_on_a_cached_upload_without_re_uploading_buffers() {
        let state = make_gl_scene3d_state();
        let mut geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_gl_mesh_upload(&state, &geometry, None);
        let buffer_data_count = calls_with("buffer_data").len();

        geometry.topology = PrimitiveTopology::TriangleStrip;
        let reused = ensure_gl_mesh_upload(&state, &geometry, None);

        assert_eq!(reused.vao, upload.vao);
        assert_eq!(reused.primitive_mode, glow::TRIANGLE_STRIP);
        assert_eq!(calls_with("buffer_data").len(), buffer_data_count);
    }

    #[test]
    fn deletes_an_obsolete_index_buffer_when_geometry_becomes_non_indexed() {
        let state = make_gl_scene3d_state();
        let mut geometry = create_box_mesh_geometry(None, None, None);
        let upload = ensure_gl_mesh_upload(&state, &geometry, None);
        assert!(upload.index_buffer.is_some());

        geometry.indices = IndexBuffer::None;
        invalidate_mesh_geometry(&mut geometry);
        let refreshed = ensure_gl_mesh_upload(&state, &geometry, None);

        assert!(refreshed.index_buffer.is_none());
        assert_eq!(calls_with("delete_buffers").len(), 1);
    }

    #[test]
    fn caches_by_geometry_and_reuses_the_upload_when_the_version_is_unchanged() {
        let state = make_gl_scene3d_state();
        let geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_gl_mesh_upload(&state, &geometry, None);
        let buffer_data_count = calls_with("buffer_data").len();
        let second = ensure_gl_mesh_upload(&state, &geometry, None);
        assert_eq!(second, first);
        // No re-upload: buffer_data not called again, only the VAO re-bound.
        assert_eq!(calls_with("buffer_data").len(), buffer_data_count);
        let context = state.context_state.runtime_state.borrow();
        let cache = context
            .scene3d_context_runtime
            .as_ref()
            .unwrap()
            .downcast_ref::<GlScene3DContextRuntime>()
            .unwrap();
        assert_eq!(cache.upload_cache.get(&get_entity_id(&geometry)), Some(&first));
    }

    #[test]
    fn re_uploads_when_the_geometry_version_is_bumped_reusing_the_gl_objects() {
        let state = make_gl_scene3d_state();
        let mut geometry = create_box_mesh_geometry(None, None, None);
        let first = ensure_gl_mesh_upload(&state, &geometry, None);
        invalidate_mesh_geometry(&mut geometry);
        let buffer_data_count = calls_with("buffer_data").len();
        let second = ensure_gl_mesh_upload(&state, &geometry, None);
        assert_eq!(second.vao, first.vao);
        assert_eq!(second.vertex_buffer, first.vertex_buffer);
        assert!(calls_with("buffer_data").len() > buffer_data_count);
        assert_eq!(second.version, i64::from(geometry.version));
    }

    #[test]
    fn converts_packed_integer_storage_into_the_float_inputs_declared_by_mesh_shaders() {
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
                    format: VertexFormat::Uint8x4,
                    semantic: VertexSemantic::Joints0,
                },
                VertexAttribute {
                    byte_offset: 16,
                    format: VertexFormat::Unorm8x4,
                    semantic: VertexSemantic::Weights0,
                },
            ],
            stride: 20,
        };
        ensure_gl_mesh_upload(&state, &geometry_from(layout, vec![0.0; 5]), None);

        let pointers = calls_with("vertex_attrib_pointer");
        let joint = pointers.iter().find(|call| call.integers[0] == 6).unwrap();
        let weight = pointers.iter().find(|call| call.integers[0] == 7).unwrap();
        assert_eq!(
            joint.integers[1..].to_vec(),
            vec![4, i64::from(glow::UNSIGNED_BYTE), 0, 20, 12]
        );
        assert_eq!(
            weight.integers[1..].to_vec(),
            vec![4, i64::from(glow::UNSIGNED_BYTE), 1, 20, 16]
        );
        assert!(calls_with("vertex_attrib_pointer_i32").is_empty());
    }

    // The double-skinning fix: a GPU-skinned draw uploads the STATIC bind pose, not the CPU-posed
    // vertices updateMeshSkin writes each frame.
    #[test]
    fn uploads_the_skin_bind_pose_not_the_cpu_posed_vertices_for_a_gpu_skinned_draw() {
        let state = make_gl_scene3d_state();
        let mut geometry = create_box_mesh_geometry(Some(2.0), Some(2.0), Some(2.0));
        let floats_per_vertex = (geometry.layout.read().unwrap().stride / 4) as usize;
        let vertex_count = geometry.vertices.len() / floats_per_vertex;
        let mut positions = vec![0.0; vertex_count * 3];
        let mut normals = vec![0.0; vertex_count * 3];
        for v in 0..vertex_count {
            let b = v * floats_per_vertex;
            positions[v * 3] = geometry.vertices[b];
            positions[v * 3 + 1] = geometry.vertices[b + 1];
            positions[v * 3 + 2] = geometry.vertices[b + 2];
            normals[v * 3] = geometry.vertices[b + 3];
            normals[v * 3 + 1] = geometry.vertices[b + 4];
            normals[v * 3 + 2] = geometry.vertices[b + 5];
        }
        let bind_x = positions[0];
        set_mesh_geometry_skin_bind_pose(&mut geometry, Some(skin_bind_pose(positions, normals)));
        // Simulate updateMeshSkin having posed the vertices: shift every position by +1000.
        let mut b = 0;
        while b < geometry.vertices.len() {
            geometry.vertices[b] += 1000.0;
            b += floats_per_vertex;
        }
        geometry.version += 1;

        ensure_gl_mesh_upload(&state, &geometry, Some(true));
        let uploaded = float_buffer_uploads().into_iter().next().unwrap();
        // Vertex 0's uploaded position.x is the bind value, not the +1000 CPU-posed value.
        // D1 f32 bound (TS: toBeCloseTo default 0.005)
        assert!((uploaded[0] - bind_x).abs() <= 0.005);
        assert!((uploaded[0] - (bind_x + 1000.0)).abs() > 0.005);
    }

    #[test]
    fn reuses_the_bind_pose_upload_across_version_bumps_for_a_gpu_skinned_draw_no_per_frame_re_skin() {
        let state = make_gl_scene3d_state();
        let mut geometry = create_box_mesh_geometry(Some(2.0), Some(2.0), Some(2.0));
        let floats_per_vertex = (geometry.layout.read().unwrap().stride / 4) as usize;
        let vertex_count = geometry.vertices.len() / floats_per_vertex;
        let mut positions = vec![0.0; vertex_count * 3];
        for v in 0..vertex_count {
            let b = v * floats_per_vertex;
            positions[v * 3] = geometry.vertices[b];
            positions[v * 3 + 1] = geometry.vertices[b + 1];
            positions[v * 3 + 2] = geometry.vertices[b + 2];
        }
        set_mesh_geometry_skin_bind_pose(
            &mut geometry,
            Some(skin_bind_pose(positions, vec![0.0; vertex_count * 3])),
        );
        ensure_gl_mesh_upload(&state, &geometry, Some(true));
        let after_first = calls_with("buffer_data").len();
        geometry.version += 1; // a per-frame updateMeshSkin bump
        ensure_gl_mesh_upload(&state, &geometry, Some(true));
        // The static bind buffer is not re-uploaded on the version bump.
        assert_eq!(calls_with("buffer_data").len(), after_first);
    }

    // Morph + skin compose on GPU: the per-frame morphed vertices (not the frozen skin bind pose) are what
    // the shader skins, and they re-upload each frame.
    #[test]
    fn uploads_the_morphed_vertices_not_the_frozen_skin_bind_pose_for_a_morphed_gpu_skinned_draw() {
        let state = make_gl_scene3d_state();
        let mut geometry = geometry_from(position_layout(), vec![1.0, 0.0, 0.0]);
        // A captured skin bind pose at the rest position x = 1 — what the freeze would pin the buffer to.
        set_mesh_geometry_skin_bind_pose(
            &mut geometry,
            Some(skin_bind_pose(vec![1.0, 0.0, 0.0], vec![0.0; 3])),
        );
        let mesh = create_mesh(Arc::new(RwLock::new(geometry)), Arc::new(RwLock::new(Vec::new())));
        let mesh_morph = morph(vec![4.0, 0.0, 0.0], 1.0);
        mesh.write().unwrap().morph = Some(mesh_morph.clone());
        // prepareScene3DMorph blends the morph into the vertices (x → 5) and captures the morph bind pose.
        update_mesh_morph(&mesh.read().unwrap());

        let geometry = mesh.read().unwrap().geometry.clone();
        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(true));
        // The morphed value (5), NOT the frozen skin bind (1): the morph is not discarded.
        // D1 f32 bound (TS: toBeCloseTo default 0.005)
        assert!((last_float32_buffer_data()[0] - 5.0).abs() <= 0.005);

        let uploads_after_first = calls_with("buffer_data").len();

        // A moving morph weight re-uploads the freshly-morphed bind (x → 9), unlike the skin-only freeze.
        mesh_morph.write().unwrap().weights[0] = 2.0;
        update_mesh_morph(&mesh.read().unwrap());
        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(true));
        assert!(calls_with("buffer_data").len() > uploads_after_first);
        // D1 f32 bound (TS: toBeCloseTo default 0.005)
        assert!((last_float32_buffer_data()[0] - 9.0).abs() <= 0.005);
    }

    // The GL vertex morph path is CPU-blend-then-upload: update_mesh_morph blends base + Σ wᵢ·targetᵢ into
    // the vertices and bumps the version, and the non-skinned upload re-uploads the deformed vertices.
    #[test]
    fn uploads_the_morph_blended_vertices_for_a_morphed_mesh_cpu_blend_then_upload_gl_path() {
        let state = make_gl_scene3d_state();
        let geometry = geometry_from(position_layout(), vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
        let mesh = create_mesh(Arc::new(RwLock::new(geometry)), Arc::new(RwLock::new(Vec::new())));
        mesh.write().unwrap().morph = Some(morph(vec![0.0, 5.0, 0.0, 0.0, 5.0, 0.0], 1.0));
        let geometry = mesh.read().unwrap().geometry.clone();

        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(false)); // before morph blends
        update_mesh_morph(&mesh.read().unwrap()); // weight 1 raises both vertices by 5 in y
        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(false));

        assert_eq!(last_float32_buffer_data(), vec![0.0, 5.0, 0.0, 1.0, 5.0, 0.0]);
    }

    #[test]
    fn re_uploads_as_the_morph_weights_change_frame_to_frame() {
        let state = make_gl_scene3d_state();
        let geometry = geometry_from(position_layout(), vec![0.0, 0.0, 0.0]);
        let mesh = create_mesh(Arc::new(RwLock::new(geometry)), Arc::new(RwLock::new(Vec::new())));
        let mesh_morph = morph(vec![2.0, 0.0, 0.0], 1.0);
        mesh.write().unwrap().morph = Some(mesh_morph.clone());
        let geometry = mesh.read().unwrap().geometry.clone();

        update_mesh_morph(&mesh.read().unwrap());
        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(false));
        assert_eq!(last_float32_buffer_data(), vec![2.0, 0.0, 0.0]);

        mesh_morph.write().unwrap().weights[0] = 0.5;
        update_mesh_morph(&mesh.read().unwrap());
        ensure_gl_mesh_upload(&state, &geometry.read().unwrap(), Some(false));
        assert_eq!(last_float32_buffer_data(), vec![1.0, 0.0, 0.0]);
    }
}
