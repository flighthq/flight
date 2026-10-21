use crate::*;
use flight_geometry::Matrix4;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::fmt::Debug;
    use std::sync::{Arc, RwLock};

    fn assert_same<T: Debug>(a: T, b: T) {
        assert_eq!(format!("{a:?}"), format!("{b:?}"));
    }

    fn fixture_layout() -> VertexAttributeLayout {
        return VertexAttributeLayout {
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
                    format: VertexFormat::Float32x2,
                    semantic: VertexSemantic::Uv1,
                },
                VertexAttribute {
                    byte_offset: 56,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Color0,
                },
                VertexAttribute {
                    byte_offset: 72,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Joints0,
                },
                VertexAttribute {
                    byte_offset: 88,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Weights0,
                },
            ],
            stride: 104,
        };
    }

    fn fixture_options() -> MeshGeometryOptions {
        let mut vertices = vec![0.0; 3 * 26];
        for i in 0..3 {
            let b = i * 26;
            vertices[b] = if i == 1 { 2.0 } else { 1.0 };
            vertices[b + 1] = if i == 2 { 3.0 } else { 2.0 };
            vertices[b + 2] = 3.0;
            vertices[b + 5] = 1.0;
            vertices[b + 6] = 1.0;
            vertices[b + 9] = 1.0;
            vertices[b + 10] = if i == 1 { 1.0 } else { 0.0 };
            vertices[b + 11] = if i == 2 { 1.0 } else { 0.0 };
            vertices[b + 14] = 0.25;
            vertices[b + 17] = 1.0;
            vertices[b + 22] = 1.0;
        }
        return MeshGeometryOptions {
            vertices: vertices.into_boxed_slice(),
            indices: Some(IndexBuffer::U16(IndexBufferU16 {
                data: Arc::new(RwLock::new(vec![0, 1, 2].into_boxed_slice())),
            })),
            layout: Arc::new(RwLock::new(fixture_layout())),
            subsets: None,
            topology: None,
        };
    }

    fn fixture_geometry() -> MeshGeometry {
        return create_mesh_geometry(fixture_options());
    }

    fn fixture_attributes() -> MeshGeometryFromAttributesOptions {
        return MeshGeometryFromAttributesOptions {
            positions: vec![1.0, 2.0, 3.0, 2.0, 2.0, 3.0, 1.0, 3.0, 3.0],
            normals: None,
            uvs: Some(vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
            indices: Some(MeshAttributeIndices::Values(vec![0, 1, 2])),
        };
    }

    fn fixture_morph() -> MeshMorph {
        return MeshMorph {
            targets: std::sync::Arc::new(vec![MeshMorphTarget {
                position_deltas: vec![0.5; 9].into_boxed_slice(),
                normal_deltas: None,
                tangent_deltas: None,
            }]),
            weights: vec![0.75].into_boxed_slice(),
        };
    }

    fn fixture_skin_pose() -> MeshSkinBindPose {
        return MeshSkinBindPose {
            positions: vec![1.0; 9].into_boxed_slice(),
            normals: vec![0.0; 9].into_boxed_slice(),
            tangents: vec![0.0; 12].into_boxed_slice(),
            joints: vec![0.0; 12].into_boxed_slice(),
            weights: vec![0.0; 12].into_boxed_slice(),
            skinned_positions: vec![0.0; 9].into_boxed_slice(),
            skinned_normals: vec![0.0; 9].into_boxed_slice(),
            skinned_tangents: vec![0.0; 12].into_boxed_slice(),
        };
    }

    fn fixture_matrix() -> flight_geometry::Matrix4 {
        let mut matrix = flight_geometry::create_matrix4();
        matrix.m[0] = 2.0;
        matrix.m[5] = 3.0;
        matrix.m[10] = 4.0;
        matrix.m[12] = 2.0;
        return matrix;
    }

    #[test]
    fn mesh_geometry_from_attributes_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_attributes(fixture_attributes()),
            create_mesh_geometry_from_attributes(fixture_attributes()),
        );
    }

    #[test]
    fn mesh_geometry_from_box_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_box(None, None, None),
            create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0)),
        );
    }

    #[test]
    fn mesh_geometry_from_capsule_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_capsule(None, None, None, None),
            create_capsule_mesh_geometry(Some(0.5), Some(1.0), Some(16), Some(8)),
        );
    }

    #[test]
    fn mesh_geometry_from_circle_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_circle(None, None),
            create_circle_mesh_geometry(Some(0.5), Some(32)),
        );
    }

    #[test]
    fn mesh_geometry_from_cone_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_cone(None, None, None, None),
            create_cone_mesh_geometry(Some(0.5), Some(1.0), Some(32), Some(true)),
        );
    }

    #[test]
    fn mesh_geometry_from_cylinder_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_cylinder(None, None, None, None, None),
            create_cylinder_mesh_geometry(Some(0.5), Some(0.5), Some(1.0), Some(32), Some(true)),
        );
    }

    #[test]
    fn mesh_geometry_from_dodecahedron_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_dodecahedron(None, None),
            create_dodecahedron_mesh_geometry(Some(0.5), Some(0)),
        );
    }

    #[test]
    fn mesh_geometry_from_icosahedron_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_icosahedron(None, None),
            create_icosahedron_mesh_geometry(Some(0.5), Some(0)),
        );
    }

    #[test]
    fn mesh_geometry_from_icosphere_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_icosphere(None, None),
            create_icosphere_mesh_geometry(Some(0.5), Some(2)),
        );
    }

    #[test]
    fn mesh_geometry_from_octahedron_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_octahedron(None, None),
            create_octahedron_mesh_geometry(Some(0.5), Some(0)),
        );
    }

    #[test]
    fn mesh_geometry_from_plane_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_plane(None, None, None, None),
            create_plane_mesh_geometry(Some(1.0), Some(1.0), Some(1), Some(1)),
        );
    }

    #[test]
    fn mesh_geometry_from_polyhedron_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_polyhedron(
                &[
                    [1.0, 1.0, 1.0],
                    [-1.0, -1.0, 1.0],
                    [-1.0, 1.0, -1.0],
                    [1.0, -1.0, -1.0],
                ],
                &[[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
                None,
                None,
            ),
            create_polyhedron_mesh_geometry(
                &[
                    [1.0, 1.0, 1.0],
                    [-1.0, -1.0, 1.0],
                    [-1.0, 1.0, -1.0],
                    [1.0, -1.0, -1.0],
                ],
                &[[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
                Some(0.5),
                Some(0),
            ),
        );
    }

    #[test]
    fn mesh_geometry_from_quad_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_quad(None, None),
            create_quad_mesh_geometry(Some(1.0), Some(1.0)),
        );
    }

    #[test]
    fn mesh_geometry_from_ring_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_ring(None, None, None),
            create_ring_mesh_geometry(Some(0.25), Some(0.5), Some(32)),
        );
    }

    #[test]
    fn mesh_geometry_from_sphere_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_sphere(None, None, None),
            create_sphere_mesh_geometry(Some(0.5), Some(32), Some(16)),
        );
    }

    #[test]
    fn mesh_geometry_from_tetrahedron_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_tetrahedron(None, None),
            create_tetrahedron_mesh_geometry(Some(0.5), Some(0)),
        );
    }

    #[test]
    fn mesh_geometry_from_torus_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_torus(None, None, None, None),
            create_torus_mesh_geometry(Some(0.5), Some(0.2), Some(24), Some(48)),
        );
    }

    #[test]
    fn mesh_geometry_from_torus_knot_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::from_torus_knot(None, None, None, None, None, None),
            create_torus_knot_mesh_geometry(
                Some(0.5),
                Some(0.15),
                Some(64),
                Some(8),
                Some(2.0),
                Some(3.0),
            ),
        );
    }

    #[test]
    fn mesh_geometry_new_matches_free_function_and_source_defaults() {
        assert_same(
            MeshGeometry::new(fixture_options()),
            create_mesh_geometry(fixture_options()),
        );
    }

    #[test]
    fn meshgeometry_add_subset_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let subset = MeshSubset {
            index_count: 3,
            index_offset: 0,
        };
        let method = a.add_subset(&subset);
        let function = add_mesh_geometry_subset(&mut b, &subset);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_blend_morph_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let morph = fixture_morph();
        let mut pose_a = capture_mesh_morph_bind_pose(&a);
        let mut pose_b = capture_mesh_morph_bind_pose(&b);
        let method = a.blend_morph(&morph, &mut pose_a);
        let function = blend_mesh_geometry_morph(&mut b, &morph, &mut pose_b);
        assert_same(method, function);
        assert_same(&a, &b);
        assert_same(pose_a, pose_b);
    }

    #[test]
    fn meshgeometry_capture_mesh_morph_bind_pose_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.capture_mesh_morph_bind_pose();
        let function = capture_mesh_morph_bind_pose(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_center_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.center();
        let function = center_mesh_geometry(&mut b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_clone_for_deformation_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.clone_for_deformation();
        let function = clone_mesh_geometry_for_deformation(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_clone_geometry_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.clone_geometry();
        let function = clone_mesh_geometry(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_clone_metadata_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.clone_metadata();
        let function = clone_mesh_geometry_metadata(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compact_vertices_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.compact_vertices();
        let function = compact_mesh_geometry_vertices(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compute_flat_normals_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let geometry = fixture_geometry();
        let method = a.compute_flat_normals(&geometry);
        let function = compute_mesh_geometry_flat_normals(&mut b, &geometry);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compute_normals_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let geometry = fixture_geometry();
        let position_groups = [0, 1, 2];
        let method = a.compute_normals(&geometry, Some(&position_groups));
        let function = compute_mesh_geometry_normals(&mut b, &geometry, Some(&position_groups));
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compute_position_groups_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.compute_position_groups();
        let function = compute_mesh_geometry_position_groups(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compute_tangents_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let geometry = fixture_geometry();
        let position_groups = [0, 1, 2];
        let method = a.compute_tangents(&geometry, Some(&position_groups));
        let function = compute_mesh_geometry_tangents(&mut b, &geometry, Some(&position_groups));
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_compute_wireframe_indices_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.compute_wireframe_indices();
        let function = compute_mesh_geometry_wireframe_indices(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_convert_layout_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let target_layout = Arc::new(RwLock::new(VertexAttributeLayout {
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
            stride: 12,
        }));
        let method = a.convert_layout(&target_layout);
        let function = convert_mesh_geometry_layout(&b, &target_layout);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_destroy_gl_data_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        a.geometry_runtime.webgl_data = Some(());
        a.geometry_runtime.webgpu_data = Some(());
        b.geometry_runtime.webgl_data = Some(());
        b.geometry_runtime.webgpu_data = Some(());
        let method = a.destroy_gl_data();
        let function = destroy_mesh_geometry_gl_data(&mut b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_destroy_wgpu_data_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        a.geometry_runtime.webgl_data = Some(());
        a.geometry_runtime.webgpu_data = Some(());
        b.geometry_runtime.webgl_data = Some(());
        b.geometry_runtime.webgpu_data = Some(());
        let method = a.destroy_wgpu_data();
        let function = destroy_mesh_geometry_wgpu_data(&mut b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_expand_indices_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.expand_indices();
        let function = expand_mesh_geometry_indices(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_has_skin_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.has_skin();
        let function = has_mesh_geometry_skin(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_index_count_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.index_count();
        let function = get_mesh_geometry_index_count(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_index_vertices_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.index_vertices();
        let function = index_mesh_geometry_vertices(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_invalidate_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.invalidate();
        let function = invalidate_mesh_geometry(&mut b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_morph_bind_pose_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let bind_pose = Arc::new(RwLock::new(capture_mesh_morph_bind_pose(&a)));
        set_mesh_geometry_morph_bind_pose(&mut a, Some(bind_pose.clone()));
        set_mesh_geometry_morph_bind_pose(&mut b, Some(bind_pose));
        let method = a.morph_bind_pose();
        let function = get_mesh_geometry_morph_bind_pose(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_offset_uvs_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.offset_uvs(0.5, 0.5);
        let function = offset_mesh_geometry_uvs(&mut b, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_refresh_bounds_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.refresh_bounds();
        let function = refresh_mesh_geometry_bounds(&mut b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_scale_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.scale(2.0, 2.0, 2.0);
        let function = scale_mesh_geometry(&mut b, 2.0, 2.0, 2.0);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_scale_uvs_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.scale_uvs(0.5, 0.5);
        let function = scale_mesh_geometry_uvs(&mut b, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_morph_bind_pose_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let bind_pose = Arc::new(RwLock::new(capture_mesh_morph_bind_pose(&a)));
        let method = a.set_morph_bind_pose(Some(bind_pose.clone()));
        let function = set_mesh_geometry_morph_bind_pose(&mut b, Some(bind_pose.clone()));
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_skin_bind_pose_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let bind_pose = Arc::new(RwLock::new(fixture_skin_pose()));
        let method = a.set_skin_bind_pose(Some(bind_pose.clone()));
        let function = set_mesh_geometry_skin_bind_pose(&mut b, Some(bind_pose.clone()));
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_subsets_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let subsets = [MeshSubset {
            index_count: 0,
            index_offset: 0,
        }];
        let method = a.set_subsets(&subsets);
        let function = set_mesh_geometry_subsets(&mut b, &subsets);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_color0_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_color0(0, 0.5, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_color0(&mut b, 0, 0.5, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_joints0_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_joints0(0, 0.5, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_joints0(&mut b, 0, 0.5, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_normal_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_normal(0, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_normal(&mut b, 0, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_position_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_position(0, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_position(&mut b, 0, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_tangent_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_tangent(0, 0.5, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_tangent(&mut b, 0, 0.5, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_uv0_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_uv0(0, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_uv0(&mut b, 0, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_uv1_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_uv1(0, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_uv1(&mut b, 0, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_set_vertex_weights0_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.set_vertex_weights0(0, 0.5, 0.5, 0.5, 0.5);
        let function = set_mesh_geometry_vertex_weights0(&mut b, 0, 0.5, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_skin_bind_pose_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let bind_pose = Arc::new(RwLock::new(fixture_skin_pose()));
        set_mesh_geometry_skin_bind_pose(&mut a, Some(bind_pose.clone()));
        set_mesh_geometry_skin_bind_pose(&mut b, Some(bind_pose));
        let method = a.skin_bind_pose();
        let function = get_mesh_geometry_skin_bind_pose(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_subset_triangle_count_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.subset_triangle_count(0);
        let function = get_mesh_geometry_subset_triangle_count(&b, 0);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_transform_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let matrix = fixture_matrix();
        let method = a.transform(&matrix);
        let function = transform_mesh_geometry(&mut b, &matrix);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_transform_into_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let source = fixture_geometry();
        let matrix = fixture_matrix();
        let method = a.transform_into(&source, &matrix);
        let function = transform_mesh_geometry_into(&mut b, &source, &matrix);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_translate_matches_free_function() {
        let mut a = fixture_geometry();
        let mut b = fixture_geometry();
        let method = a.translate(0.5, 0.5, 0.5);
        let function = translate_mesh_geometry(&mut b, 0.5, 0.5, 0.5);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_triangle_count_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.triangle_count();
        let function = get_mesh_geometry_triangle_count(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_triangle_subset_index_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.triangle_subset_index(0);
        let function = get_mesh_geometry_triangle_subset_index(&b, 0);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_validate_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.validate();
        let function = validate_mesh_geometry(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_vertex_count_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.vertex_count();
        let function = get_mesh_geometry_vertex_count(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshgeometry_weld_vertices_matches_free_function() {
        let a = fixture_geometry();
        let b = fixture_geometry();
        let method = a.weld_vertices();
        let function = weld_mesh_geometry_vertices(&b);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn meshtrianglevertexindices_triangle_vertex_indices_matches_free_function() {
        let mut a = MeshTriangleVertexIndices {
            i0: 0,
            i1: 0,
            i2: 0,
        };
        let mut b = MeshTriangleVertexIndices {
            i0: 0,
            i1: 0,
            i2: 0,
        };
        let geometry = fixture_geometry();
        let method = a.triangle_vertex_indices(&geometry, 0);
        let function = get_mesh_geometry_triangle_vertex_indices(&mut b, &geometry, 0);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn vertexattributelayout_vertex_attribute_matches_free_function() {
        let a = fixture_layout();
        let b = fixture_layout();
        let method = a.vertex_attribute(VertexSemantic::Normal);
        let function = get_vertex_attribute(&b, VertexSemantic::Normal);
        assert_same(method, function);
        assert_same(&a, &b);
    }

    #[test]
    fn vertexattributelayout_vertex_attribute_float_offset_matches_free_function() {
        let a = fixture_layout();
        let b = fixture_layout();
        let method = a.vertex_attribute_float_offset(VertexSemantic::Normal);
        let function = get_vertex_attribute_float_offset(&b, VertexSemantic::Normal);
        assert_same(method, function);
        assert_same(&a, &b);
    }
}

impl MeshGeometry {
    pub fn new(options: MeshGeometryOptions) -> MeshGeometry {
        return create_mesh_geometry(options);
    }
    pub fn add_subset(&mut self, subset: &MeshSubset) {
        return add_mesh_geometry_subset(self, subset);
    }
    pub fn blend_morph(&mut self, morph: &MeshMorph, bind_pose: &mut MeshMorphBindPose) {
        return blend_mesh_geometry_morph(self, morph, bind_pose);
    }
    pub fn capture_mesh_morph_bind_pose(&self) -> MeshMorphBindPose {
        return capture_mesh_morph_bind_pose(self);
    }
    pub fn center(&mut self) {
        return center_mesh_geometry(self);
    }
    pub fn clone_for_deformation(&self) -> MeshGeometry {
        return clone_mesh_geometry_for_deformation(self);
    }
    pub fn clone_geometry(&self) -> MeshGeometry {
        return clone_mesh_geometry(self);
    }
    pub fn clone_metadata(&self) -> MeshGeometry {
        return clone_mesh_geometry_metadata(self);
    }
    pub fn compact_vertices(&self) -> MeshGeometry {
        return compact_mesh_geometry_vertices(self);
    }
    pub fn compute_flat_normals(&mut self, geometry: &MeshGeometry) {
        return compute_mesh_geometry_flat_normals(self, geometry);
    }
    pub fn compute_normals(&mut self, geometry: &MeshGeometry, position_groups: Option<&[u32]>) {
        return compute_mesh_geometry_normals(self, geometry, position_groups);
    }
    pub fn compute_position_groups(&self) -> Box<[u32]> {
        return compute_mesh_geometry_position_groups(self);
    }
    pub fn compute_tangents(&mut self, geometry: &MeshGeometry, position_groups: Option<&[u32]>) {
        return compute_mesh_geometry_tangents(self, geometry, position_groups);
    }
    pub fn compute_wireframe_indices(&self) -> IndexBuffer {
        return compute_mesh_geometry_wireframe_indices(self);
    }
    pub fn convert_layout(
        &self,
        target_layout: &flight_entity::Ref<VertexAttributeLayout>,
    ) -> MeshGeometry {
        return convert_mesh_geometry_layout(self, target_layout);
    }
    pub fn destroy_gl_data(&mut self) {
        return destroy_mesh_geometry_gl_data(self);
    }
    pub fn destroy_wgpu_data(&mut self) {
        return destroy_mesh_geometry_wgpu_data(self);
    }
    pub fn expand_indices(&self) -> MeshGeometry {
        return expand_mesh_geometry_indices(self);
    }
    pub fn from_attributes(options: MeshGeometryFromAttributesOptions) -> MeshGeometry {
        return create_mesh_geometry_from_attributes(options);
    }
    pub fn from_box(width: Option<f32>, height: Option<f32>, depth: Option<f32>) -> MeshGeometry {
        return create_box_mesh_geometry(width, height, depth);
    }
    pub fn from_capsule(
        radius: Option<f32>,
        height: Option<f32>,
        radial_segments: Option<i32>,
        cap_segments: Option<i32>,
    ) -> MeshGeometry {
        return create_capsule_mesh_geometry(radius, height, radial_segments, cap_segments);
    }
    pub fn from_circle(radius: Option<f32>, segments: Option<i32>) -> MeshGeometry {
        return create_circle_mesh_geometry(radius, segments);
    }
    pub fn from_cone(
        radius: Option<f32>,
        height: Option<f32>,
        radial_segments: Option<i32>,
        capped: Option<bool>,
    ) -> MeshGeometry {
        return create_cone_mesh_geometry(radius, height, radial_segments, capped);
    }
    pub fn from_cylinder(
        top_radius: Option<f32>,
        bottom_radius: Option<f32>,
        height: Option<f32>,
        radial_segments: Option<i32>,
        capped: Option<bool>,
    ) -> MeshGeometry {
        return create_cylinder_mesh_geometry(
            top_radius,
            bottom_radius,
            height,
            radial_segments,
            capped,
        );
    }
    pub fn from_dodecahedron(radius: Option<f32>, detail: Option<i32>) -> MeshGeometry {
        return create_dodecahedron_mesh_geometry(radius, detail);
    }
    pub fn from_icosahedron(radius: Option<f32>, detail: Option<i32>) -> MeshGeometry {
        return create_icosahedron_mesh_geometry(radius, detail);
    }
    pub fn from_icosphere(radius: Option<f32>, subdivisions: Option<i32>) -> MeshGeometry {
        return create_icosphere_mesh_geometry(radius, subdivisions);
    }
    pub fn from_octahedron(radius: Option<f32>, detail: Option<i32>) -> MeshGeometry {
        return create_octahedron_mesh_geometry(radius, detail);
    }
    pub fn from_plane(
        width: Option<f32>,
        depth: Option<f32>,
        width_segments: Option<i32>,
        depth_segments: Option<i32>,
    ) -> MeshGeometry {
        return create_plane_mesh_geometry(width, depth, width_segments, depth_segments);
    }
    pub fn from_polyhedron(
        vertex_positions: &[[f32; 3]],
        face_indices: &[[u32; 3]],
        radius: Option<f32>,
        detail: Option<i32>,
    ) -> MeshGeometry {
        return create_polyhedron_mesh_geometry(vertex_positions, face_indices, radius, detail);
    }
    pub fn from_quad(width: Option<f32>, height: Option<f32>) -> MeshGeometry {
        return create_quad_mesh_geometry(width, height);
    }
    pub fn from_ring(
        inner_radius: Option<f32>,
        outer_radius: Option<f32>,
        segments: Option<i32>,
    ) -> MeshGeometry {
        return create_ring_mesh_geometry(inner_radius, outer_radius, segments);
    }
    pub fn from_sphere(
        radius: Option<f32>,
        width_segments: Option<i32>,
        height_segments: Option<i32>,
    ) -> MeshGeometry {
        return create_sphere_mesh_geometry(radius, width_segments, height_segments);
    }
    pub fn from_tetrahedron(radius: Option<f32>, detail: Option<i32>) -> MeshGeometry {
        return create_tetrahedron_mesh_geometry(radius, detail);
    }
    pub fn from_torus(
        radius: Option<f32>,
        tube: Option<f32>,
        radial_segments: Option<i32>,
        tubular_segments: Option<i32>,
    ) -> MeshGeometry {
        return create_torus_mesh_geometry(radius, tube, radial_segments, tubular_segments);
    }
    pub fn from_torus_knot(
        radius: Option<f32>,
        tube: Option<f32>,
        tubular_segments: Option<i32>,
        radial_segments: Option<i32>,
        p: Option<f32>,
        q: Option<f32>,
    ) -> MeshGeometry {
        return create_torus_knot_mesh_geometry(
            radius,
            tube,
            tubular_segments,
            radial_segments,
            p,
            q,
        );
    }
    pub fn has_skin(&self) -> bool {
        return has_mesh_geometry_skin(self);
    }
    pub fn index_count(&self) -> u32 {
        return get_mesh_geometry_index_count(self);
    }
    pub fn index_vertices(&self) -> MeshGeometry {
        return index_mesh_geometry_vertices(self);
    }
    pub fn invalidate(&mut self) {
        return invalidate_mesh_geometry(self);
    }
    pub fn morph_bind_pose(&self) -> Option<&flight_entity::Ref<MeshMorphBindPose>> {
        return get_mesh_geometry_morph_bind_pose(self);
    }
    pub fn offset_uvs(&mut self, du: f32, dv: f32) {
        return offset_mesh_geometry_uvs(self, du, dv);
    }
    pub fn refresh_bounds(&mut self) {
        return refresh_mesh_geometry_bounds(self);
    }
    pub fn scale(&mut self, sx: f32, sy: f32, sz: f32) {
        return scale_mesh_geometry(self, sx, sy, sz);
    }
    pub fn scale_uvs(&mut self, su: f32, sv: f32) {
        return scale_mesh_geometry_uvs(self, su, sv);
    }
    pub fn set_morph_bind_pose(
        &mut self,
        bind_pose: Option<flight_entity::Ref<MeshMorphBindPose>>,
    ) {
        return set_mesh_geometry_morph_bind_pose(self, bind_pose);
    }
    pub fn set_skin_bind_pose(&mut self, bind_pose: Option<flight_entity::Ref<MeshSkinBindPose>>) {
        return set_mesh_geometry_skin_bind_pose(self, bind_pose);
    }
    pub fn set_subsets(&mut self, subsets: &[MeshSubset]) {
        return set_mesh_geometry_subsets(self, subsets);
    }
    pub fn set_vertex_color0(&mut self, vertex_index: u32, r: f32, g: f32, b: f32, a: f32) -> bool {
        return set_mesh_geometry_vertex_color0(self, vertex_index, r, g, b, a);
    }
    pub fn set_vertex_joints0(
        &mut self,
        vertex_index: u32,
        x: f32,
        y: f32,
        z: f32,
        w: f32,
    ) -> bool {
        return set_mesh_geometry_vertex_joints0(self, vertex_index, x, y, z, w);
    }
    pub fn set_vertex_normal(&mut self, vertex_index: u32, x: f32, y: f32, z: f32) -> bool {
        return set_mesh_geometry_vertex_normal(self, vertex_index, x, y, z);
    }
    pub fn set_vertex_position(&mut self, vertex_index: u32, x: f32, y: f32, z: f32) -> bool {
        return set_mesh_geometry_vertex_position(self, vertex_index, x, y, z);
    }
    pub fn set_vertex_tangent(
        &mut self,
        vertex_index: u32,
        x: f32,
        y: f32,
        z: f32,
        w: f32,
    ) -> bool {
        return set_mesh_geometry_vertex_tangent(self, vertex_index, x, y, z, w);
    }
    pub fn set_vertex_uv0(&mut self, vertex_index: u32, u: f32, v: f32) -> bool {
        return set_mesh_geometry_vertex_uv0(self, vertex_index, u, v);
    }
    pub fn set_vertex_uv1(&mut self, vertex_index: u32, u: f32, v: f32) -> bool {
        return set_mesh_geometry_vertex_uv1(self, vertex_index, u, v);
    }
    pub fn set_vertex_weights0(
        &mut self,
        vertex_index: u32,
        x: f32,
        y: f32,
        z: f32,
        w: f32,
    ) -> bool {
        return set_mesh_geometry_vertex_weights0(self, vertex_index, x, y, z, w);
    }
    pub fn skin_bind_pose(&self) -> Option<&flight_entity::Ref<MeshSkinBindPose>> {
        return get_mesh_geometry_skin_bind_pose(self);
    }
    pub fn subset_triangle_count(&self, subset_index: i32) -> u32 {
        return get_mesh_geometry_subset_triangle_count(self, subset_index);
    }
    pub fn transform(&mut self, matrix: &Matrix4) -> bool {
        return transform_mesh_geometry(self, matrix);
    }
    pub fn transform_into(&mut self, source: &MeshGeometry, matrix: &Matrix4) -> bool {
        return transform_mesh_geometry_into(self, source, matrix);
    }
    pub fn translate(&mut self, x: f32, y: f32, z: f32) {
        return translate_mesh_geometry(self, x, y, z);
    }
    pub fn triangle_count(&self) -> u32 {
        return get_mesh_geometry_triangle_count(self);
    }
    pub fn triangle_subset_index(&self, triangle_index: i32) -> i32 {
        return get_mesh_geometry_triangle_subset_index(self, triangle_index);
    }
    pub fn validate(&self) -> bool {
        return validate_mesh_geometry(self);
    }
    pub fn vertex_count(&self) -> u32 {
        return get_mesh_geometry_vertex_count(self);
    }
    pub fn weld_vertices(&self) -> MeshGeometry {
        return weld_mesh_geometry_vertices(self);
    }
}

impl VertexAttributeLayout {
    pub fn vertex_attribute(&self, semantic: VertexSemantic) -> Option<&VertexAttribute> {
        return get_vertex_attribute(self, semantic);
    }
    pub fn vertex_attribute_float_offset(&self, semantic: VertexSemantic) -> i32 {
        return get_vertex_attribute_float_offset(self, semantic);
    }
}

impl MeshTriangleVertexIndices {
    pub fn triangle_vertex_indices(
        &mut self,
        geometry: &MeshGeometry,
        triangle_index: u32,
    ) -> bool {
        return get_mesh_geometry_triangle_vertex_indices(self, geometry, triangle_index);
    }
}
