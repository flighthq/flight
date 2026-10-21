use flight_geometry::{create_matrix3, create_matrix4, set_matrix3_normal_from_matrix4};
use flight_skeleton3d::*;
fn identity() -> Vec<f32> {
    return create_matrix4().m.to_vec();
}
fn translation(x: f32, y: f32, z: f32) -> Vec<f32> {
    let mut m = identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
}
fn normal_palette(palette: &[f32]) -> Vec<f32> {
    let mut out = vec![0.0; palette.len() / 16 * 12];
    for j in 0..palette.len() / 16 {
        let mut m = create_matrix4();
        m.m.copy_from_slice(&palette[j * 16..j * 16 + 16]);
        let mut normal = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut normal, &m);
        for c in 0..3 {
            out[j * 12 + c * 4..j * 12 + c * 4 + 3].copy_from_slice(&normal.m[c * 3..c * 3 + 3]);
        }
    }
    return out;
}
fn rotate_z() -> Vec<f32> {
    return vec![
        0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ];
}
fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.00001, "{a} != {b}");
}
mod skin_tangents {
    use super::*;
    #[test]
    fn leaves_an_uninfluenced_tangent_at_bind_pose() {
        let mut out = [0.0; 4];
        let mut m = identity();
        m[0] = 9.0;
        skin_tangents(&mut out, &[1.0, 0.0, 0.0, -1.0], &[0.0; 4], &[0.0; 4], &m);
        assert_eq!(out, [1.0, 0.0, 0.0, -1.0]);
    }
    #[test]
    fn rotates_the_direction_and_preserves_both_handedness_signs() {
        for sign in [-1.0, 1.0] {
            let mut out = [0.0; 4];
            skin_tangents(
                &mut out,
                &[1.0, 0.0, 0.0, sign],
                &[0.0; 4],
                &[1.0, 0.0, 0.0, 0.0],
                &rotate_z(),
            );
            assert_eq!(out, [0.0, 1.0, 0.0, sign]);
        }
    }
    #[test]
    fn preserves_normal_orthogonality_and_matches_rigid_normal_transforms() {
        let palette = rotate_z();
        for vector in [[1.0, 0.0, 0.0], [0.3, -0.7, 0.5]] {
            let mut position = [0.0; 3];
            let mut normal = [0.0; 3];
            let mut tangent = [0.0; 4];
            skin_vertices(
                &mut position,
                &mut normal,
                &[0.0; 3],
                &vector,
                &[0.0; 4],
                &[1.0, 0.0, 0.0, 0.0],
                &palette,
                &normal_palette(&palette),
            );
            skin_tangents(
                &mut tangent,
                &[vector[0], vector[1], vector[2], -1.0],
                &[0.0; 4],
                &[1.0, 0.0, 0.0, 0.0],
                &palette,
            );
            assert_eq!(&tangent[..3], &normal);
        }
        let mut position = [0.0; 3];
        let mut normal = [0.0; 3];
        skin_vertices(
            &mut position,
            &mut normal,
            &[0.0; 3],
            &[0.0, 1.0, 0.0],
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &palette,
            &normal_palette(&palette),
        );
        let mut tangent = [0.0; 4];
        skin_tangents(
            &mut tangent,
            &[1.0, 0.0, 0.0, 1.0],
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &palette,
        );
        close(
            tangent[0] * normal[0] + tangent[1] * normal[1] + tangent[2] * normal[2],
            0.0,
        );
    }
    #[test]
    fn captures_inputs_before_in_place_output_and_ignores_empty_or_partial_tail() {
        let mut tangent = [1.0, 0.0, 0.0, -1.0, 17.0];
        let input = tangent;
        skin_tangents(
            &mut tangent,
            &input,
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &rotate_z(),
        );
        assert_eq!(tangent, [0.0, 1.0, 0.0, -1.0, 17.0]);
        skin_tangents(&mut [], &[], &[], &[], &[]);
    }
}
mod skin_vertices {
    use super::*;
    #[test]
    fn passes_uninfluenced_and_identity_vertices_through_without_collapsing() {
        for weights in [[0.0; 4], [1.0, 0.0, 0.0, 0.0]] {
            let mut p = [0.0; 3];
            let mut n = [0.0; 3];
            let m = if weights[0] == 0.0 {
                translation(100.0, 0.0, 0.0)
            } else {
                identity()
            };
            skin_vertices(
                &mut p,
                &mut n,
                &[5.0, 6.0, 7.0],
                &[0.0, 1.0, 0.0],
                &[0.0; 4],
                &weights,
                &m,
                &normal_palette(&m),
            );
            assert_eq!(p, [5.0, 6.0, 7.0]);
            assert_eq!(n, [0.0, 1.0, 0.0]);
        }
    }
    #[test]
    fn translates_positions_without_translating_normals() {
        let m = translation(10.0, 20.0, 30.0);
        let mut p = [0.0; 3];
        let mut n = [0.0; 3];
        skin_vertices(
            &mut p,
            &mut n,
            &[1.0, 0.0, 0.0],
            &[0.0, 0.0, 1.0],
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        assert_eq!(p, [11.0, 20.0, 30.0]);
        assert_eq!(n, [0.0, 0.0, 1.0]);
        assert_ne!(p.as_ptr(), n.as_ptr());
    }
    #[test]
    fn blends_multiple_joints_without_renormalizing_weights() {
        let m = [translation(10.0, 0.0, 0.0), translation(0.0, 10.0, 0.0)].concat();
        let mut p = [0.0; 3];
        let mut n = [0.0; 3];
        skin_vertices(
            &mut p,
            &mut n,
            &[0.0; 3],
            &[0.0; 3],
            &[0.0, 1.0, 0.0, 0.0],
            &[0.25, 0.75, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        assert_eq!(p, [2.5, 7.5, 0.0]);
        skin_vertices(
            &mut p,
            &mut n,
            &[0.0; 3],
            &[0.0; 3],
            &[0.0, 1.0, 0.0, 0.0],
            &[0.5, 1.5, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        assert_eq!(p, [5.0, 15.0, 0.0]);
    }
    #[test]
    fn skins_every_vertex_and_captures_inputs_before_overwriting_outputs() {
        let m = translation(5.0, 0.0, 0.0);
        let mut p = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let mut n = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0];
        let positions = p;
        let normals = n;
        skin_vertices(
            &mut p,
            &mut n,
            &positions,
            &normals,
            &[0.0; 8],
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        assert_eq!(p, [6.0, 0.0, 0.0, 5.0, 1.0, 0.0]);
        let m = translation(1.0, 1.0, 1.0);
        let mut p = [1.0, 2.0, 3.0];
        let mut n = [1.0, 0.0, 0.0];
        let positions = p;
        let normals = n;
        skin_vertices(
            &mut p,
            &mut n,
            &positions,
            &normals,
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        assert_eq!(p, [2.0, 3.0, 4.0]);
    }
    #[test]
    fn transforms_normals_as_covectors_and_preserves_rigid_bits() {
        let mut m = identity();
        m[0] = 2.0;
        let mut p = [0.0; 3];
        let mut n = [0.0; 3];
        skin_vertices(
            &mut p,
            &mut n,
            &[0.0; 3],
            &[1.0, 1.0, 0.0],
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        close(n[0] / n[1], 0.5);
        let mut m = rotate_z();
        m[12] = 3.0;
        m[13] = 4.0;
        m[14] = 5.0;
        let mut original = [0.0; 3];
        let v = [0.3, -0.7, 0.5];
        skin_vertices(
            &mut p,
            &mut n,
            &[0.0; 3],
            &v,
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &m,
            &normal_palette(&m),
        );
        skin_vertices(
            &mut p,
            &mut original,
            &[0.0; 3],
            &v,
            &[0.0; 4],
            &[1.0, 0.0, 0.0, 0.0],
            &m,
            &[0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        );
        assert_eq!(n.map(f32::to_bits), original.map(f32::to_bits));
    }
    #[test]
    fn retains_tail_and_propagates_invalid_nonzero_influences_as_nan() {
        let mut p = [17.0; 4];
        let mut n = [19.0; 4];
        skin_vertices(
            &mut p,
            &mut n,
            &[1.0, 2.0, 3.0, 9.0],
            &[0.0, 1.0, 0.0],
            &[-1.0, 0.0, 0.0, 0.0],
            &[1.0, 0.0, 0.0, 0.0],
            &identity(),
            &[0.0; 12],
        );
        assert!(p[..3].iter().all(|v| v.is_nan()));
        assert_eq!(p[3], 17.0);
        assert_eq!(n[3], 19.0);
    }
}
