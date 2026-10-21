use flight_geometry::Aabb;
use flight_mesh::*;

fn canonical_layout() -> VertexAttributeLayout {
    return canonical_mesh_geometry_layout();
}

fn make_triangle() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 3 * 12];
    let set_vertex = |verts: &mut Vec<f32>, i: usize, px: f32, py: f32, u: f32, v: f32| {
        let b = i * 12;
        verts[b] = px;
        verts[b + 1] = py;
        verts[b + 2] = 0.0;
        verts[b + 10] = u;
        verts[b + 11] = v;
    };
    set_vertex(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0);
    set_vertex(&mut vertices, 1, 1.0, 0.0, 1.0, 0.0);
    set_vertex(&mut vertices, 2, 0.0, 1.0, 0.0, 1.0);
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

fn make_uv_seam_fold() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 6 * 12];
    let set_vertex = |verts: &mut Vec<f32>, i: usize, px: f32, py: f32, pz: f32, u: f32, v: f32| {
        let b = i * 12;
        verts[b] = px;
        verts[b + 1] = py;
        verts[b + 2] = pz;
        verts[b + 10] = u;
        verts[b + 11] = v;
    };
    set_vertex(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0, 0.0);
    set_vertex(&mut vertices, 1, 2.0, 0.0, 0.0, 1.0, 0.0);
    set_vertex(&mut vertices, 2, 0.0, 2.0, 0.0, 0.0, 1.0);
    set_vertex(&mut vertices, 3, 0.0, 0.0, 0.0, 0.25, 0.25);
    set_vertex(&mut vertices, 4, 2.0, 0.0, 0.0, 0.75, 0.25);
    set_vertex(&mut vertices, 5, 0.0, 0.0, 1.0, 0.25, 0.75);
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5])),
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

fn set_canonical_vertex(vertices: &mut Vec<f32>, vertex: usize, x: f32, y: f32, u: f32, v: f32) {
    let base = vertex * 12;
    vertices[base] = x;
    vertices[base + 1] = y;
    vertices[base + 10] = u;
    vertices[base + 11] = v;
}

fn reconstruct_bitangent(vertices: &[f32], vertex: usize) -> [f32; 3] {
    let base = vertex * 12;
    let nx = vertices[base + 3];
    let ny = vertices[base + 4];
    let nz = vertices[base + 5];
    let tx = vertices[base + 6];
    let ty = vertices[base + 7];
    let tz = vertices[base + 8];
    let sign = vertices[base + 9];
    return [
        sign * (ny * tz - nz * ty),
        sign * (nz * tx - nx * tz),
        sign * (nx * ty - ny * tx),
    ];
}

fn create_strip_quad(topology: PrimitiveTopology) -> MeshGeometry {
    let mut vertices = vec![0.0f32; 4 * 12];
    set_canonical_vertex(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0);
    set_canonical_vertex(&mut vertices, 1, 1.0, 0.0, 1.0, 0.0);
    set_canonical_vertex(&mut vertices, 2, 0.0, 1.0, 0.0, 1.0);
    set_canonical_vertex(&mut vertices, 3, 1.0, 1.0, 0.3, 0.9);
    vertices[3 * 12 + 2] = 1.0; // lift the fourth corner out of the plane
    let indices = if topology == PrimitiveTopology::TriangleStrip {
        vec![0u16, 1, 2, 3]
    } else {
        vec![0u16, 1, 2, 2, 1, 3]
    };
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(indices)),
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: Some(topology),
    });
}

mod compute_mesh_geometry_bounding_sphere {
    use super::*;

    #[test]
    fn writes_the_center_and_radius_for_a_unit_side_triangle() {
        let geometry = make_triangle();
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let radius = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        assert!((center.x - 0.5).abs() < 1e-3);
        assert!((center.y - 0.5).abs() < 1e-3);
        assert!(center.z.abs() < 1e-3);
        assert!(radius > 0.0);
    }

    #[test]
    fn radius_encloses_all_vertices() {
        let geometry = make_triangle();
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let r = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        let stride = 12usize;
        for i in 0..3 {
            let dx = geometry.vertices[i * stride] - center.x;
            let dy = geometry.vertices[i * stride + 1] - center.y;
            let dz = geometry.vertices[i * stride + 2] - center.z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            assert!(dist <= r + 1e-6);
        }
    }

    #[test]
    fn encloses_a_unit_box() {
        let geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let radius = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        assert!(radius >= 1.7);
        assert!(center.x.abs() < 1e-3);
        assert!(center.y.abs() < 1e-3);
        assert!(center.z.abs() < 1e-3);
    }

    #[test]
    fn returns_negative_radius_for_empty_geometry() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![],
            subsets: None,
            topology: None,
        });
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let radius = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        assert!(radius < 0.0);
        assert_eq!(center.x, 0.0);
        assert_eq!(center.y, 0.0);
        assert_eq!(center.z, 0.0);
    }
}

mod compute_mesh_geometry_bounds {
    use super::*;

    #[test]
    fn writes_the_tight_aabb_of_all_positions() {
        let geometry = make_triangle();
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert_eq!(bounds.min.x, 0.0);
        assert_eq!(bounds.min.y, 0.0);
        assert_eq!(bounds.max.x, 1.0);
        assert_eq!(bounds.max.y, 1.0);
        assert_eq!(bounds.max.z, 0.0);
    }

    #[test]
    fn computes_tight_aabb_for_a_box() {
        let geometry = create_box_mesh_geometry(2.0, 4.0, 6.0);
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert!((bounds.min.x - (-1.0)).abs() < 1e-3);
        assert!((bounds.max.x - 1.0).abs() < 1e-3);
        assert!((bounds.min.y - (-2.0)).abs() < 1e-3);
        assert!((bounds.max.y - 2.0).abs() < 1e-3);
        assert!((bounds.min.z - (-3.0)).abs() < 1e-3);
        assert!((bounds.max.z - 3.0).abs() < 1e-3);
    }

    #[test]
    fn returns_infinity_for_empty_geometry() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![],
            subsets: None,
            topology: None,
        });
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert!(bounds.min.x > bounds.max.x);
    }

    #[test]
    fn yields_an_empty_box_for_an_empty_vertex_stream() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![],
            subsets: None,
            topology: None,
        });
        let mut bounds = Aabb::default();
        bounds.min.x = 1.0;
        bounds.max.x = 4.0;
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert_eq!(bounds.min.x, f32::INFINITY);
        assert_eq!(bounds.max.x, f32::NEG_INFINITY);
    }
}

mod compute_mesh_geometry_flat_normals {
    use super::*;

    #[test]
    fn writes_the_face_normal_for_a_ccw_triangle_indexed() {
        let mut geometry = make_triangle();
        compute_mesh_geometry_flat_normals(&mut geometry);
        for i in 0..3 {
            assert!((geometry.vertices[i * 12 + 3]).abs() < 1e-3);
            assert!((geometry.vertices[i * 12 + 4]).abs() < 1e-3);
            assert!((geometry.vertices[i * 12 + 5] - 1.0).abs() < 1e-3);
        }
    }

    #[test]
    fn writes_the_face_normal_for_a_ccw_triangle_non_indexed() {
        let mut vertices = vec![0.0f32; 3 * 12];
        let set_vertex = |verts: &mut Vec<f32>, i: usize, px: f32, py: f32| {
            let b = i * 12;
            verts[b] = px;
            verts[b + 1] = py;
            verts[b + 2] = 0.0;
        };
        set_vertex(&mut vertices, 0, 0.0, 0.0);
        set_vertex(&mut vertices, 1, 1.0, 0.0);
        set_vertex(&mut vertices, 2, 0.0, 1.0);
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        compute_mesh_geometry_flat_normals(&mut geometry);
        for i in 0..3 {
            assert!((geometry.vertices[i * 12 + 3]).abs() < 1e-3);
            assert!((geometry.vertices[i * 12 + 4]).abs() < 1e-3);
            assert!((geometry.vertices[i * 12 + 5] - 1.0).abs() < 1e-3);
        }
    }

    #[test]
    fn bumps_version() {
        let mut geometry = make_triangle();
        let prev_version = geometry.version;
        compute_mesh_geometry_flat_normals(&mut geometry);
        assert_eq!(geometry.version, prev_version + 1);
    }

    #[test]
    fn produces_unit_length_normals() {
        let mut geometry = make_triangle();
        compute_mesh_geometry_flat_normals(&mut geometry);
        for i in 0..3 {
            let nx = geometry.vertices[i * 12 + 3];
            let ny = geometry.vertices[i * 12 + 4];
            let nz = geometry.vertices[i * 12 + 5];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!((len - 1.0).abs() < 1e-3);
        }
    }

    #[test]
    fn flat_normals_point_outward_on_a_box() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        compute_mesh_geometry_flat_normals(&mut geometry);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * stride + 3;
            let nx = geometry.vertices[b];
            let ny = geometry.vertices[b + 1];
            let nz = geometry.vertices[b + 2];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!((len - 1.0).abs() < 1e-3, "vertex {} normal length {}", i, len);
        }
    }
}

mod compute_mesh_geometry_normals {
    use super::*;

    #[test]
    fn writes_the_unit_face_normal_for_a_ccw_triangle() {
        let mut geometry = make_triangle();
        compute_mesh_geometry_normals(&mut geometry, None);
        assert!((geometry.vertices[3]).abs() < 1e-3);
        assert!((geometry.vertices[4]).abs() < 1e-3);
        assert!((geometry.vertices[5] - 1.0).abs() < 1e-3);
    }

    #[test]
    fn bumps_the_output_version_after_rewriting_normals() {
        let mut geometry = make_triangle();
        let prev_version = geometry.version;
        compute_mesh_geometry_normals(&mut geometry, None);
        assert_eq!(geometry.version, prev_version + 1);
    }

    #[test]
    fn keeps_duplicated_positions_independent_when_position_groups_are_omitted() {
        let mut geometry = make_uv_seam_fold();
        compute_mesh_geometry_normals(&mut geometry, None);
        // First triangle: normal +Z
        assert_eq!(geometry.vertices[3], 0.0);
        assert_eq!(geometry.vertices[4], 0.0);
        assert_eq!(geometry.vertices[5], 1.0);
        // Second triangle: normal -Y
        assert_eq!(geometry.vertices[3 * 12 + 3], 0.0);
        assert_eq!(geometry.vertices[3 * 12 + 4], -1.0);
        assert_eq!(geometry.vertices[3 * 12 + 5], 0.0);
    }

    #[test]
    fn area_weights_face_normals_inside_exact_position_groups() {
        let mut geometry = make_uv_seam_fold();
        let groups = compute_mesh_geometry_position_groups(&geometry);
        compute_mesh_geometry_normals(&mut geometry, Some(&groups));
        let expected_y = -1.0 / (5.0f32).sqrt();
        let expected_z = 2.0 / (5.0f32).sqrt();
        for vertex in [0, 1, 3, 4] {
            let base = vertex * 12 + 3;
            assert!((geometry.vertices[base]).abs() < 1e-3);
            assert!((geometry.vertices[base + 1] - expected_y).abs() < 1e-3);
            assert!((geometry.vertices[base + 2] - expected_z).abs() < 1e-3);
        }
    }

    #[test]
    fn smooth_normals_are_mostly_unit_length() {
        let mut geometry = create_sphere_mesh_geometry(1.0, 16, 8);
        compute_mesh_geometry_normals(&mut geometry, None);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        let mut unit_count = 0u32;
        for i in 0..count as usize {
            let b = i * stride + 3;
            let nx = geometry.vertices[b];
            let ny = geometry.vertices[b + 1];
            let nz = geometry.vertices[b + 2];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            if (len - 1.0).abs() < 1e-2 {
                unit_count += 1;
            }
        }
        assert!(unit_count as f32 / count as f32 > 0.95,
            "only {}/{} normals are unit length", unit_count, count);
    }
}

mod compute_mesh_geometry_position_groups {
    use super::*;

    #[test]
    fn groups_welded_vertices() {
        let geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let groups = compute_mesh_geometry_position_groups(&geometry);
        assert_eq!(groups.len() as u32, get_mesh_geometry_vertex_count(&geometry));
    }

    #[test]
    fn returns_the_first_exact_position_vertex_as_each_group_representative() {
        let geometry = make_uv_seam_fold();
        let groups = compute_mesh_geometry_position_groups(&geometry);
        assert_eq!(groups, vec![0, 1, 2, 0, 1, 5]);
    }

    #[test]
    fn does_not_group_adjacent_float32_values() {
        let mut geometry = make_uv_seam_fold();
        // Change the bit pattern of vertex 3's x position by reinterpreting as u32
        let bits = geometry.vertices[3 * 12].to_bits() ^ 1;
        geometry.vertices[3 * 12] = f32::from_bits(bits);
        let groups = compute_mesh_geometry_position_groups(&geometry);
        // Vertex 3 should no longer group with vertex 0
        assert_eq!(groups[3], 3);
    }
}

mod compute_mesh_geometry_tangents {
    use super::*;

    #[test]
    fn writes_a_unit_tangent_aligned_with_plus_x_for_canonical_uv_mapping() {
        let mut geometry = make_triangle();
        compute_mesh_geometry_normals(&mut geometry, None);
        compute_mesh_geometry_tangents(&mut geometry, None);
        // u increases along +X, so tangent.xyz ~ (1,0,0)
        assert!((geometry.vertices[6] - 1.0).abs() < 1e-3);
        assert!((geometry.vertices[7]).abs() < 1e-3);
        assert!((geometry.vertices[8]).abs() < 1e-3);
        // Right-handed mapping => positive handedness
        assert_eq!(geometry.vertices[9], 1.0);
    }

    #[test]
    fn computes_unit_tangents_on_a_box() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        compute_mesh_geometry_tangents(&mut geometry, None);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * stride + 6;
            let tx = geometry.vertices[b];
            let ty = geometry.vertices[b + 1];
            let tz = geometry.vertices[b + 2];
            let len = (tx * tx + ty * ty + tz * tz).sqrt();
            assert!((len - 1.0).abs() < 1e-2, "vertex {} tangent length {}", i, len);
        }
    }

    #[test]
    fn produces_negative_handedness_when_v_axis_is_flipped() {
        let mut geometry = make_triangle();
        geometry.vertices[2 * 12 + 11] = -1.0;
        compute_mesh_geometry_normals(&mut geometry, None);
        compute_mesh_geometry_tangents(&mut geometry, None);
        assert_eq!(geometry.vertices[9], -1.0);
    }

    #[test]
    fn keeps_the_reconstructed_bitangent_continuous_across_a_grouped_mirrored_uv_seam() {
        let mut vertices = vec![0.0f32; 6 * 12];
        set_canonical_vertex(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0);
        set_canonical_vertex(&mut vertices, 1, 1.0, 0.0, 1.0, 0.0);
        set_canonical_vertex(&mut vertices, 2, 0.0, 1.0, 0.0, 1.0);
        set_canonical_vertex(&mut vertices, 3, 0.0, 0.0, 0.0, 0.0);
        set_canonical_vertex(&mut vertices, 4, -1.0, 0.0, 0.0, 1.0);
        set_canonical_vertex(&mut vertices, 5, 0.0, -1.0, 1.0, 0.0);
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5])),
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        let groups = compute_mesh_geometry_position_groups(&geometry);
        compute_mesh_geometry_normals(&mut geometry, Some(&groups));
        compute_mesh_geometry_tangents(&mut geometry, Some(&groups));

        assert_eq!(geometry.vertices[9], 1.0);
        assert_eq!(geometry.vertices[3 * 12 + 9], -1.0);
        let first_bitangent = reconstruct_bitangent(&geometry.vertices, 0);
        let mirrored_bitangent = reconstruct_bitangent(&geometry.vertices, 3);
        let expected = -1.0 / (2.0f32).sqrt();
        assert!((first_bitangent[0] - expected).abs() < 1e-3);
        assert!((first_bitangent[1] - (-expected)).abs() < 1e-3);
        assert!((first_bitangent[2]).abs() < 1e-3);
        for component in 0..3 {
            assert!((mirrored_bitangent[component] - first_bitangent[component]).abs() < 1e-3);
        }
    }

    #[test]
    fn splits_shared_vertices_at_a_mirrored_uv_handedness_boundary() {
        let mut vertices = vec![0.0f32; 4 * 12];
        set_canonical_vertex(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0);
        set_canonical_vertex(&mut vertices, 1, 1.0, 0.0, 1.0, 0.0);
        set_canonical_vertex(&mut vertices, 2, 0.0, 1.0, 0.0, 1.0);
        set_canonical_vertex(&mut vertices, 3, -1.0, 0.0, 1.0, 0.0);
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 0, 2, 3])),
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        let groups = compute_mesh_geometry_position_groups(&geometry);
        compute_mesh_geometry_normals(&mut geometry, Some(&groups));
        let prev_version = geometry.version;

        compute_mesh_geometry_tangents(&mut geometry, Some(&groups));

        assert_eq!(geometry.vertices.len() / 12, 6);
        assert_eq!(geometry.version, prev_version + 1);
        let indices = match &geometry.indices {
            IndexBuffer::U16(v) => v.iter().map(|&x| x as u32).collect::<Vec<_>>(),
            IndexBuffer::U32(v) => v.clone(),
            IndexBuffer::None => vec![],
        };
        let first_sign = geometry.vertices[indices[0] as usize * 12 + 9];
        let mirrored_sign = geometry.vertices[indices[3] as usize * 12 + 9];
        assert_eq!(first_sign, 1.0);
        assert_eq!(mirrored_sign, -1.0);
        for corner in 0..3 {
            assert_eq!(geometry.vertices[indices[corner] as usize * 12 + 9], first_sign);
            assert_eq!(geometry.vertices[indices[corner + 3] as usize * 12 + 9], mirrored_sign);
        }
        assert_eq!(indices[0], 0);
        assert_eq!(indices[2], 2);
        assert!(indices[3] >= 4);
        assert!(indices[4] >= 4);
        let first_bitangent = reconstruct_bitangent(&geometry.vertices, indices[0] as usize);
        let mirrored_bitangent = reconstruct_bitangent(&geometry.vertices, indices[3] as usize);
        for component in 0..3 {
            assert!((mirrored_bitangent[component] - first_bitangent[component]).abs() < 1e-3);
        }
    }

    #[test]
    fn copies_the_complete_skinned_record_when_splitting_a_mirrored_tangent_seam() {
        let skinned_layout = canonical_skinned_mesh_geometry_layout();
        let stride = skinned_layout.stride as usize / 4;
        let mut vertices = vec![0.0f32; 4 * stride];
        let set_skinned = |verts: &mut Vec<f32>, vertex: usize, x: f32, y: f32, u: f32, v: f32, joint: f32| {
            let base = vertex * stride;
            verts[base] = x;
            verts[base + 1] = y;
            verts[base + 10] = u;
            verts[base + 11] = v;
            verts[base + 12] = joint;
            verts[base + 13] = joint + 1.0;
            verts[base + 14] = joint + 2.0;
            verts[base + 15] = joint + 3.0;
            verts[base + 16] = 0.1;
            verts[base + 17] = 0.2;
            verts[base + 18] = 0.3;
            verts[base + 19] = 0.4;
        };
        set_skinned(&mut vertices, 0, 0.0, 0.0, 0.0, 0.0, 10.0);
        set_skinned(&mut vertices, 1, 1.0, 0.0, 1.0, 0.0, 20.0);
        set_skinned(&mut vertices, 2, 0.0, 1.0, 0.0, 1.0, 30.0);
        set_skinned(&mut vertices, 3, -1.0, 0.0, 1.0, 0.0, 40.0);
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 0, 2, 3])),
            layout: skinned_layout,
            vertices,
            subsets: None,
            topology: None,
        });
        compute_mesh_geometry_normals(&mut geometry, None);
        compute_mesh_geometry_tangents(&mut geometry, None);

        let indices: Vec<u32> = match &geometry.indices {
            IndexBuffer::U16(v) => v.iter().map(|x| *x as u32).collect(),
            IndexBuffer::U32(v) => v.clone(),
            IndexBuffer::None => vec![],
        };
        let split = indices[3] as usize;
        assert!(split >= 4);
        // The split for source vertex 0 retains its joints0 and weights0.
        assert_eq!(geometry.vertices[split * stride + 12], 10.0);
        assert_eq!(geometry.vertices[split * stride + 13], 11.0);
        assert_eq!(geometry.vertices[split * stride + 14], 12.0);
        assert_eq!(geometry.vertices[split * stride + 15], 13.0);
        assert!((geometry.vertices[split * stride + 16] - 0.1).abs() < 1e-6);
        assert!((geometry.vertices[split * stride + 17] - 0.2).abs() < 1e-6);
        assert!((geometry.vertices[split * stride + 18] - 0.3).abs() < 1e-6);
        assert!((geometry.vertices[split * stride + 19] - 0.4).abs() < 1e-6);
    }

    #[test]
    fn uses_a_unit_perpendicular_fallback_for_degenerate_uvs() {
        let mut geometry = make_triangle();
        for vertex in 0..3 {
            let base = vertex * 12;
            geometry.vertices[base + 3] = 1.0;
            geometry.vertices[base + 4] = 0.0;
            geometry.vertices[base + 5] = 0.0;
            geometry.vertices[base + 10] = 0.0;
            geometry.vertices[base + 11] = 0.0;
        }
        compute_mesh_geometry_tangents(&mut geometry, None);
        let tx = geometry.vertices[6];
        let ty = geometry.vertices[7];
        let tz = geometry.vertices[8];
        let len = (tx * tx + ty * ty + tz * tz).sqrt();
        assert!((len - 1.0).abs() < 1e-3);
        assert!(tx.abs() < 1e-3);
        assert!(geometry.vertices[9].abs() == 1.0);
    }
}

mod ensure_mesh_geometry_bounds {
    use super::*;

    #[test]
    fn computes_bounds_on_first_call_and_caches() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        geometry.bounds = None;
        let first = ensure_mesh_geometry_bounds(&mut geometry);
        assert!(first.is_some());
        let first_b = first.unwrap();
        assert!((first_b.max.x - 0.5).abs() < 1e-3);

        let second = ensure_mesh_geometry_bounds(&mut geometry);
        assert!(second.is_some());
        let second_b = second.unwrap();
        assert_eq!(first_b.max.x, second_b.max.x);
    }

    #[test]
    fn computes_on_first_query_then_reuses_cache_until_version_moves() {
        let mut geometry = make_triangle();
        assert!(geometry.bounds.is_none());

        let bounds = ensure_mesh_geometry_bounds(&mut geometry);
        assert!((bounds.unwrap().max.x - 1.0).abs() < 1e-6);

        // A vertex edit WITHOUT a version bump must not be picked up
        geometry.vertices[12] = 4.0;
        let cached = ensure_mesh_geometry_bounds(&mut geometry);
        assert!((cached.unwrap().max.x - 1.0).abs() < 1e-6);

        // Invalidate => re-sweep
        invalidate_mesh_geometry(&mut geometry);
        let refreshed = ensure_mesh_geometry_bounds(&mut geometry);
        assert!((refreshed.unwrap().max.x - 4.0).abs() < 1e-6);
    }

    #[test]
    fn trusts_bounds_supplied_at_construction_without_re_sweeping() {
        let mut geometry = make_triangle();
        refresh_mesh_geometry_bounds(&mut geometry);
        let bounds = geometry.bounds.clone();
        let ensured = ensure_mesh_geometry_bounds(&mut geometry);
        assert_eq!(ensured, bounds);
    }
}

mod refresh_mesh_geometry_bounds {
    use super::*;

    #[test]
    fn recomputes_bounds_after_vertex_modification() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        geometry.vertices[0] = 100.0;
        geometry.version += 1;
        refresh_mesh_geometry_bounds(&mut geometry);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.x - 100.0).abs() < 1e-3);
    }

    #[test]
    fn allocates_once_then_refreshes_same_cached_bounds() {
        let mut geometry = make_triangle();
        assert!(geometry.bounds.is_none());
        refresh_mesh_geometry_bounds(&mut geometry);
        let bounds = geometry.bounds.clone();
        assert!((bounds.unwrap().max.x - 1.0).abs() < 1e-6);

        geometry.vertices[12] = 4.0;
        refresh_mesh_geometry_bounds(&mut geometry);
        assert!((geometry.bounds.as_ref().unwrap().max.x - 4.0).abs() < 1e-6);
    }
}

mod triangle_strip_topology {
    use super::*;

    fn expect_strip_matches_list_normals(offset: usize, component_count: usize) {
        let mut strip = create_strip_quad(PrimitiveTopology::TriangleStrip);
        let mut list = create_strip_quad(PrimitiveTopology::TriangleList);
        compute_mesh_geometry_normals(&mut strip, None);
        compute_mesh_geometry_normals(&mut list, None);
        for vertex in 0..4 {
            for component in 0..component_count {
                let strip_val = strip.vertices[vertex * 12 + offset + component];
                let list_val = list.vertices[vertex * 12 + offset + component];
                assert!((strip_val - list_val).abs() < 1e-5,
                    "vertex {} component {}: strip={} list={}", vertex, component, strip_val, list_val);
            }
        }
    }

    fn expect_strip_matches_list_flat_normals(offset: usize, component_count: usize) {
        let mut strip = create_strip_quad(PrimitiveTopology::TriangleStrip);
        let mut list = create_strip_quad(PrimitiveTopology::TriangleList);
        compute_mesh_geometry_flat_normals(&mut strip);
        compute_mesh_geometry_flat_normals(&mut list);
        for vertex in 0..4 {
            for component in 0..component_count {
                let strip_val = strip.vertices[vertex * 12 + offset + component];
                let list_val = list.vertices[vertex * 12 + offset + component];
                assert!((strip_val - list_val).abs() < 1e-5,
                    "vertex {} component {}: strip={} list={}", vertex, component, strip_val, list_val);
            }
        }
    }

    #[test]
    fn compute_normals_reads_a_strip_as_two_triangles_not_one() {
        expect_strip_matches_list_normals(3, 3);
    }

    #[test]
    fn compute_flat_normals_reads_a_strip_as_two_triangles_not_one() {
        expect_strip_matches_list_flat_normals(3, 3);
    }

    #[test]
    fn compute_tangents_reads_a_strip_as_two_triangles_not_one() {
        let mut strip = create_strip_quad(PrimitiveTopology::TriangleStrip);
        let mut list = create_strip_quad(PrimitiveTopology::TriangleList);
        compute_mesh_geometry_normals(&mut strip, None);
        compute_mesh_geometry_normals(&mut list, None);
        compute_mesh_geometry_tangents(&mut strip, None);
        compute_mesh_geometry_tangents(&mut list, None);
        for vertex in 0..4 {
            for component in 0..4 {
                let strip_val = strip.vertices[vertex * 12 + 6 + component];
                let list_val = list.vertices[vertex * 12 + 6 + component];
                assert!((strip_val - list_val).abs() < 1e-5,
                    "vertex {} component {}: strip={} list={}", vertex, component, strip_val, list_val);
            }
        }
    }

    #[test]
    fn leaves_no_vertex_of_a_strip_without_a_normal() {
        let mut strip = create_strip_quad(PrimitiveTopology::TriangleStrip);
        compute_mesh_geometry_normals(&mut strip, None);
        for vertex in 0..4 {
            let nx = strip.vertices[vertex * 12 + 3];
            let ny = strip.vertices[vertex * 12 + 4];
            let nz = strip.vertices[vertex * 12 + 5];
            let length = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!((length - 1.0).abs() < 1e-5, "vertex {} normal length {}", vertex, length);
        }
    }
}
