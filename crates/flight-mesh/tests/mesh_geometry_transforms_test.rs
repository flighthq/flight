use flight_mesh::*;
use flight_geometry::Matrix4;

fn canonical_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x3, semantic: VertexSemantic::Normal },
            VertexAttribute { byte_offset: 24, format: VertexFormat::Float32x4, semantic: VertexSemantic::Tangent },
            VertexAttribute { byte_offset: 40, format: VertexFormat::Float32x2, semantic: VertexSemantic::Uv0 },
        ],
        stride: 48,
    };
}

fn make_vertex(px: f32, py: f32, pz: f32) -> MeshGeometry {
    let mut vertices = vec![0.0f32; 12];
    vertices[0] = px;
    vertices[1] = py;
    vertices[2] = pz;
    vertices[3] = 1.0; vertices[4] = 0.0; vertices[5] = 0.0;
    vertices[6] = 0.0; vertices[7] = 1.0; vertices[8] = 0.0; vertices[9] = 1.0;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

fn make_diagonal_frame_vertex() -> MeshGeometry {
    let r = std::f32::consts::FRAC_1_SQRT_2;
    let mut vertices = vec![0.0f32; 12];
    vertices[0] = 1.0;
    vertices[3] = r; vertices[4] = r;
    vertices[6] = r; vertices[7] = -r;
    vertices[9] = 1.0;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

fn normal_dot_tangent(geometry: &MeshGeometry) -> f32 {
    let v = &geometry.vertices;
    return v[3] * v[6] + v[4] * v[7] + v[5] * v[8];
}

fn identity_matrix() -> Matrix4 {
    return Matrix4 {
        m: [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ],
    };
}

mod center_mesh_geometry {
    use super::*;

    #[test]
    fn translates_geometry_so_bounds_center_is_at_origin() {
        let mut v4 = vec![0.0f32; 12 * 2];
        v4[0] = 0.0;
        v4[12] = 4.0;
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: v4,
            subsets: None,
            topology: None,
        });
        let mut bounds = flight_geometry::Aabb {
            min: flight_geometry::Vector3 { x: 0.0, y: 0.0, z: 0.0 },
            max: flight_geometry::Vector3 { x: 4.0, y: 0.0, z: 0.0 },
        };
        compute_mesh_geometry_bounds(&mut bounds, &geo);
        geo.bounds = Some(bounds);
        center_mesh_geometry(&mut geo);
        assert!((geo.vertices[0] - (-2.0)).abs() < 1e-3);
        assert!((geo.vertices[12] - 2.0).abs() < 1e-3);
    }

    #[test]
    fn is_a_no_op_when_already_centered() {
        let mut geo = make_vertex(0.0, 0.0, 0.0);
        let v0 = geo.version;
        geo.bounds = Some(flight_geometry::Aabb {
            min: flight_geometry::Vector3 { x: -0.5, y: -0.5, z: -0.5 },
            max: flight_geometry::Vector3 { x: 0.5, y: 0.5, z: 0.5 },
        });
        center_mesh_geometry(&mut geo);
        assert_eq!(geo.version, v0);
    }
}

mod scale_mesh_geometry {
    use super::*;

    #[test]
    fn scales_positions_by_the_given_factors() {
        let mut geo = make_vertex(1.0, 2.0, 3.0);
        scale_mesh_geometry(&mut geo, 2.0, 3.0, 4.0);
        assert!((geo.vertices[0] - 2.0).abs() < 1e-6);
        assert!((geo.vertices[1] - 6.0).abs() < 1e-6);
        assert!((geo.vertices[2] - 12.0).abs() < 1e-6);
    }

    #[test]
    fn re_normalizes_normals_under_non_uniform_scale() {
        let mut geo = make_vertex(1.0, 0.0, 0.0);
        scale_mesh_geometry(&mut geo, 2.0, 1.0, 1.0);
        let nx = geo.vertices[3];
        let ny = geo.vertices[4];
        let nz = geo.vertices[5];
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        assert!((len - 1.0).abs() < 1e-6);
    }

    #[test]
    fn bumps_version() {
        let mut geo = make_vertex(1.0, 0.0, 0.0);
        let v0 = geo.version;
        scale_mesh_geometry(&mut geo, 1.0, 1.0, 1.0);
        assert_eq!(geo.version, v0 + 1);
    }

    #[test]
    fn keeps_tangent_on_the_surface_under_non_uniform_scale() {
        let mut geo = make_diagonal_frame_vertex();
        scale_mesh_geometry(&mut geo, 2.0, 1.0, 1.0);
        assert!(normal_dot_tangent(&geo).abs() < 1e-5);
    }

    #[test]
    fn keeps_tangent_on_the_surface_under_scale_mesh_geometry_too() {
        let mut geo = make_diagonal_frame_vertex();
        scale_mesh_geometry(&mut geo, 2.0, 1.0, 1.0);
        assert!(normal_dot_tangent(&geo).abs() < 1e-5);
    }

    #[test]
    fn reverses_indexed_triangle_winding_and_flips_handedness_when_mirroring() {
        let mut vertices = vec![0.0f32; 3 * 12];
        for v in 0..3 {
            vertices[v * 12 + 9] = 1.0;
        }
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        scale_mesh_geometry(&mut geo, -1.0, 1.0, 1.0);
        match &geo.indices {
            IndexBuffer::U16(v) => {
                assert_eq!(v[0], 0);
                assert_eq!(v[1], 2);
                assert_eq!(v[2], 1);
            }
            _ => panic!("expected U16 indices"),
        }
        for v in 0..3 {
            assert_eq!(geo.vertices[v * 12 + 9], -1.0);
        }
    }

    #[test]
    fn reverses_non_indexed_triangle_winding_by_swapping_whole_records() {
        let mut vertices = vec![0.0f32; 3 * 12];
        for v in 0..3 {
            vertices[v * 12] = v as f32;
            vertices[v * 12 + 10] = v as f32;
        }
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        scale_mesh_geometry(&mut geo, -1.0, 1.0, 1.0);
        assert_eq!(geo.vertices[0], 0.0);
        assert_eq!(geo.vertices[12], -2.0);
        assert_eq!(geo.vertices[24], -1.0);
        assert_eq!(geo.vertices[10], 0.0);
        assert_eq!(geo.vertices[22], 2.0);
        assert_eq!(geo.vertices[34], 1.0);
    }

    #[test]
    fn leaves_winding_and_handedness_alone_when_transform_does_not_mirror() {
        let mut vertices = vec![0.0f32; 3 * 12];
        for v in 0..3 {
            vertices[v * 12 + 9] = 1.0;
        }
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        scale_mesh_geometry(&mut geo, 2.0, 3.0, 4.0);
        match &geo.indices {
            IndexBuffer::U16(v) => {
                assert_eq!(v[0], 0);
                assert_eq!(v[1], 1);
                assert_eq!(v[2], 2);
            }
            _ => panic!("expected U16 indices"),
        }
        for v in 0..3 {
            assert_eq!(geo.vertices[v * 12 + 9], 1.0);
        }
    }

    #[test]
    fn flips_strip_handedness_but_leaves_strip_indices_untouched() {
        let mut vertices = vec![0.0f32; 4 * 12];
        for v in 0..4 {
            vertices[v * 12 + 9] = 1.0;
        }
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3])),
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),
        });
        scale_mesh_geometry(&mut geo, -1.0, 1.0, 1.0);
        match &geo.indices {
            IndexBuffer::U16(v) => {
                assert_eq!(&v[..], &[0, 1, 2, 3]);
            }
            _ => panic!("expected U16 indices"),
        }
        for v in 0..4 {
            assert_eq!(geo.vertices[v * 12 + 9], -1.0);
        }
    }
}

mod transform_mesh_geometry {
    use super::*;

    #[test]
    fn applies_translation_to_positions() {
        let mut geo = make_vertex(0.0, 0.0, 0.0);
        let mut m = identity_matrix();
        m.m[12] = 5.0;
        m.m[13] = 6.0;
        m.m[14] = 7.0;
        assert!(transform_mesh_geometry(&mut geo, &m));
        assert!((geo.vertices[0] - 5.0).abs() < 1e-6);
        assert!((geo.vertices[1] - 6.0).abs() < 1e-6);
        assert!((geo.vertices[2] - 7.0).abs() < 1e-6);
    }

    #[test]
    fn returns_false_for_a_singular_matrix() {
        let mut geo = make_vertex(1.0, 0.0, 0.0);
        let m = Matrix4 { m: [0.0; 16] };
        assert!(!transform_mesh_geometry(&mut geo, &m));
    }

    #[test]
    fn bumps_version_on_success() {
        let mut geo = make_vertex(1.0, 0.0, 0.0);
        let m = identity_matrix();
        let v0 = geo.version;
        transform_mesh_geometry(&mut geo, &m);
        assert_eq!(geo.version, v0 + 1);
    }

    #[test]
    fn keeps_tangent_on_the_surface_under_non_uniform_scale() {
        let mut geo = make_diagonal_frame_vertex();
        let m = Matrix4 {
            m: [
                2.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        };
        transform_mesh_geometry(&mut geo, &m);
        assert!(normal_dot_tangent(&geo).abs() < 1e-5);
    }
}

mod transform_mesh_geometry_into {
    use super::*;

    #[test]
    fn applies_translation_in_place() {
        let mut geo = make_vertex(1.0, 0.0, 0.0);
        let mut m = identity_matrix();
        m.m[12] = 3.0;
        assert!(transform_mesh_geometry_into(&mut geo, &m));
        assert!((geo.vertices[0] - 4.0).abs() < 1e-6);
    }
}

mod translate_mesh_geometry {
    use super::*;

    #[test]
    fn offsets_all_positions_by_xyz() {
        let mut geo = make_vertex(1.0, 2.0, 3.0);
        translate_mesh_geometry(&mut geo, 10.0, 20.0, 30.0);
        assert!((geo.vertices[0] - 11.0).abs() < 1e-6);
        assert!((geo.vertices[1] - 22.0).abs() < 1e-6);
        assert!((geo.vertices[2] - 33.0).abs() < 1e-6);
    }

    #[test]
    fn does_not_affect_normals() {
        let mut geo = make_vertex(0.0, 0.0, 0.0);
        translate_mesh_geometry(&mut geo, 5.0, 5.0, 5.0);
        assert_eq!(geo.vertices[3], 1.0);
        assert_eq!(geo.vertices[4], 0.0);
        assert_eq!(geo.vertices[5], 0.0);
    }

    #[test]
    fn bumps_version_and_updates_bounds() {
        let mut geo = make_vertex(0.0, 0.0, 0.0);
        geo.bounds = Some(flight_geometry::Aabb {
            min: flight_geometry::Vector3 { x: 0.0, y: 0.0, z: 0.0 },
            max: flight_geometry::Vector3 { x: 0.0, y: 0.0, z: 0.0 },
        });
        let v0 = geo.version;
        translate_mesh_geometry(&mut geo, 5.0, 0.0, 0.0);
        assert_eq!(geo.version, v0 + 1);
        let b = geo.bounds.unwrap();
        assert!((b.min.x - 5.0).abs() < 1e-6);
        assert!((b.max.x - 5.0).abs() < 1e-6);
    }
}
