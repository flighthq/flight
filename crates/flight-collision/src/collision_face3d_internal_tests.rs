use super::*;

fn expect_coplanar_along(vertices: &[f32], count: usize, axis: usize, value: f32) {
    for i in 0..count {
        assert!(
            (vertices[i * 3 + axis] - value).abs() < 1e-9,
            "vertex {} axis {} expected {} got {}",
            i,
            axis,
            value,
            vertices[i * 3 + axis]
        );
    }
}

fn lying_capsule() -> CollisionCapsule3D {
    return CollisionCapsule3D {
        x0: -2.0,
        y0: 0.0,
        z0: 0.0,
        x1: 2.0,
        y1: 0.0,
        z1: 0.0,
        radius: 0.5,
    };
}

fn make_aabb() -> CollisionAabb3D {
    return CollisionAabb3D {
        min_x: -1.0,
        min_y: -2.0,
        min_z: -3.0,
        max_x: 1.0,
        max_y: 2.0,
        max_z: 3.0,
    };
}

fn unit_cube() -> CollisionConvex3D {
    return CollisionConvex3D {
        points: vec![
            -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0,
            -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
        ],
    };
}

#[test]
fn write_collision_aabb_face3d_returns_the_four_corners_of_the_selected_face() {
    let aabb = make_aabb();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_aabb_face3d(&aabb, 0.0, 1.0, 0.0, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 1, 2.0);

    assert_eq!(
        write_collision_aabb_face3d(&aabb, 0.0, -1.0, 0.0, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 1, -2.0);
}

#[test]
fn write_collision_aabb_face3d_selects_by_dominant_axis() {
    let aabb = make_aabb();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_aabb_face3d(&aabb, 0.05, 1.0, -0.05, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 1, 2.0);
}

#[test]
fn write_collision_aabb_face3d_spans_the_whole_face_extent_on_the_other_two_axes() {
    let aabb = make_aabb();
    let mut face = Vec::new();

    write_collision_aabb_face3d(&aabb, 1.0, 0.0, 0.0, &mut face);

    let ys: Vec<f32> = (0..4).map(|i| face[i * 3 + 1]).collect();
    let zs: Vec<f32> = (0..4).map(|i| face[i * 3 + 2]).collect();

    let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
        - ys.iter().cloned().fold(f32::INFINITY, f32::min);
    let z_range = zs.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
        - zs.iter().cloned().fold(f32::INFINITY, f32::min);

    assert!((y_range - 4.0).abs() < 1e-9);
    assert!((z_range - 6.0).abs() < 1e-9);
}

#[test]
fn write_collision_box_face3d_matches_the_aabb_query_when_rotation_is_identity() {
    let b = CollisionBox3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        half_x: 1.0,
        half_y: 2.0,
        half_z: 3.0,
        rotation_x: 0.0,
        rotation_y: 0.0,
        rotation_z: 0.0,
        rotation_w: 1.0,
    };
    let mut face = Vec::new();

    assert_eq!(
        write_collision_box_face3d(&b, 0.0, 1.0, 0.0, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 1, 2.0);
}

#[test]
fn write_collision_box_face3d_returns_the_spun_face_for_a_rotated_box() {
    let angle = std::f32::consts::PI / 8.0;
    let b = CollisionBox3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        half_x: 1.0,
        half_y: 1.0,
        half_z: 1.0,
        rotation_x: 0.0,
        rotation_y: angle.sin(),
        rotation_z: 0.0,
        rotation_w: angle.cos(),
    };
    let mut face = Vec::new();

    assert_eq!(
        write_collision_box_face3d(&b, 0.0, 1.0, 0.0, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 1, 1.0);

    let xs: Vec<f32> = (0..4).map(|i| face[i * 3]).collect();
    let max_x = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    assert!((max_x - std::f32::consts::SQRT_2).abs() < 1e-6);
}

#[test]
fn write_collision_capsule_face3d_returns_single_point_along_the_axis() {
    let capsule = lying_capsule();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_capsule_face3d(&capsule, 1.0, 0.0, 0.0, &mut face),
        1
    );
}

#[test]
fn write_collision_capsule_face3d_returns_single_point_for_a_zero_length_segment() {
    let degenerate = CollisionCapsule3D {
        x0: 0.0,
        y0: 0.0,
        z0: 0.0,
        x1: 0.0,
        y1: 0.0,
        z1: 0.0,
        radius: 1.0,
    };
    let mut face = Vec::new();

    assert_eq!(
        write_collision_capsule_face3d(&degenerate, 0.0, 1.0, 0.0, &mut face),
        1
    );
}

#[test]
fn write_collision_capsule_face3d_returns_the_two_offset_endpoints() {
    let capsule = lying_capsule();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_capsule_face3d(&capsule, 0.0, -1.0, 0.0, &mut face),
        2
    );
    assert!((face[0] - (-2.0)).abs() < 1e-9);
    assert!((face[1] - (-0.5)).abs() < 1e-9);
    assert!((face[3] - 2.0).abs() < 1e-9);
    assert!((face[4] - (-0.5)).abs() < 1e-9);
}

#[test]
fn write_collision_capsule_face3d_returns_two_points_for_a_zero_direction() {
    let capsule = lying_capsule();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_capsule_face3d(&capsule, 0.0, 0.0, 0.0, &mut face),
        2
    );
}

#[test]
fn write_collision_convex_face3d_recovers_a_face_without_topology() {
    let cube = unit_cube();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_convex_face3d(&cube, 0.0, 0.0, 1.0, &mut face),
        4
    );
    expect_coplanar_along(&face, 4, 2, 1.0);
}

#[test]
fn write_collision_convex_face3d_returns_a_single_vertex_for_a_corner() {
    let cube = unit_cube();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_convex_face3d(&cube, 1.0, 1.0, 1.0, &mut face),
        1
    );
}

#[test]
fn write_collision_convex_face3d_returns_an_edge_for_an_edge_direction() {
    let cube = unit_cube();
    let mut face = Vec::new();

    assert_eq!(
        write_collision_convex_face3d(&cube, 1.0, 1.0, 0.0, &mut face),
        2
    );
}

#[test]
fn write_collision_convex_face3d_returns_no_face_for_an_empty_hull() {
    let empty = CollisionConvex3D { points: vec![] };
    let mut face = Vec::new();

    assert_eq!(
        write_collision_convex_face3d(&empty, 0.0, 1.0, 0.0, &mut face),
        0
    );
}

#[test]
fn write_collision_convex_face3d_winds_consecutive_vertices_as_edges() {
    let cube = unit_cube();
    let mut face = Vec::new();

    write_collision_convex_face3d(&cube, 0.0, 0.0, 1.0, &mut face);

    for i in 0..4 {
        let next = (i + 1) % 4;
        let dx = face[next * 3] - face[i * 3];
        let dy = face[next * 3 + 1] - face[i * 3 + 1];
        let dz = face[next * 3 + 2] - face[i * 3 + 2];
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        assert!(
            (dist - 2.0).abs() < 1e-6,
            "edge {} length {} expected 2.0",
            i,
            dist
        );
    }
}
