use flight_collision::*;
use flight_collision::contract::*;

const CUBE: [f64; 24] = [
    -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0, 1.0, 1.0,
    -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
];

const TETRAHEDRON: [f64; 12] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

/// The signed volume of the closed surface, by the divergence theorem: one sixth of the sum
/// of each triangle's scalar triple product about the origin. This is the single strongest
/// check available -- it is positive only if EVERY triangle is wound outward, and equals the
/// true volume only if the surface is closed and non-overlapping.
fn signed_volume(points: &[f64], indices: &[usize], count: usize) -> f64 {
    let mut total = 0.0;
    for f in 0..count {
        let a = indices[f * 3];
        let b = indices[f * 3 + 1];
        let c = indices[f * 3 + 2];
        let ax = points[a * 3];
        let ay = points[a * 3 + 1];
        let az = points[a * 3 + 2];
        let bx = points[b * 3];
        let by = points[b * 3 + 1];
        let bz = points[b * 3 + 2];
        let cx = points[c * 3];
        let cy = points[c * 3 + 1];
        let cz = points[c * 3 + 2];
        total += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    total / 6.0
}

/// Every edge of a closed orientable surface must appear exactly twice, once in each direction.
fn is_closed_surface(indices: &[usize], count: usize) -> bool {
    use std::collections::HashMap;
    let mut seen: HashMap<(usize, usize), usize> = HashMap::new();
    for f in 0..count {
        let v = [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]];
        for e in 0..3 {
            let u = v[e];
            let w = v[(e + 1) % 3];
            *seen.entry((u, w)).or_insert(0) += 1;
        }
    }
    for (&(u, w), &times) in &seen {
        if times != 1 {
            return false;
        }
        if *seen.get(&(w, u)).unwrap_or(&0) != 1 {
            return false;
        }
    }
    true
}

mod write_collision_convex_hull_faces3d {
    use super::*;

    #[test]
    fn triangulates_a_cube_into_a_closed_surface_of_the_right_volume() {
        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &CUBE.to_vec());
        // Six square faces, two triangles each.
        assert_eq!(count, 12);
        assert!((signed_volume(&CUBE, &faces, count) - 8.0).abs() < 1e-9);
        assert!(is_closed_surface(&faces, count));
    }

    #[test]
    fn triangulates_a_tetrahedron() {
        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &TETRAHEDRON.to_vec());
        assert_eq!(count, 4);
        assert!((signed_volume(&TETRAHEDRON, &faces, count) - 1.0 / 6.0).abs() < 1e-12);
        assert!(is_closed_surface(&faces, count));
    }

    #[test]
    fn winds_every_triangle_outward_not_merely_consistently() {
        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &CUBE.to_vec());
        assert!(signed_volume(&CUBE, &faces, count) > 0.0);
    }

    #[test]
    fn ignores_points_strictly_inside_the_hull() {
        let mut with_interior: Vec<f64> = CUBE.to_vec();
        with_interior.extend_from_slice(&[0.0, 0.0, 0.0, 0.5, 0.25, -0.25]);
        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &with_interior);
        assert_eq!(count, 12);
        assert!((signed_volume(&with_interior, &faces, count) - 8.0).abs() < 1e-9);
    }

    #[test]
    fn produces_the_same_hull_however_the_points_were_ordered() {
        let mut reversed = Vec::new();
        let point_count = CUBE.len() / 3;
        for i in (0..point_count).rev() {
            reversed.push(CUBE[i * 3]);
            reversed.push(CUBE[i * 3 + 1]);
            reversed.push(CUBE[i * 3 + 2]);
        }

        let mut forward_faces = Vec::new();
        let forward_count = write_collision_convex_hull_faces3d(&mut forward_faces, &CUBE.to_vec());
        let forward_volume = signed_volume(&CUBE, &forward_faces, forward_count);

        let mut reversed_faces = Vec::new();
        let reversed_count = write_collision_convex_hull_faces3d(&mut reversed_faces, &reversed);

        assert_eq!(reversed_count, forward_count);
        assert!(
            (signed_volume(&reversed, &reversed_faces, reversed_count) - forward_volume).abs()
                < 1e-9
        );
    }

    #[test]
    fn closes_a_many_point_hull_without_a_hole() {
        // A geodesic-ish sphere sample.
        let mut points = Vec::new();
        for i in 0..60 {
            let z = 1.0 - (2.0 * i as f64) / 59.0;
            let r = (1.0 - z * z).max(0.0).sqrt();
            let theta = i as f64 * 2.399963;
            points.push(r * theta.cos());
            points.push(r * theta.sin());
            points.push(z);
        }

        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &points);

        assert!(count > 0);
        assert!(is_closed_surface(&faces, count));
        // A hull inscribed in the unit sphere is a bit under the sphere's 4.18876.
        let volume = signed_volume(&points, &faces, count);
        assert!(volume > 3.5);
        assert!(volume < 4.19);
    }

    #[test]
    fn returns_nothing_for_fewer_than_four_points() {
        let mut faces = Vec::new();
        assert_eq!(
            write_collision_convex_hull_faces3d(&mut faces, &vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]),
            0
        );
        assert!(faces.is_empty());
    }

    #[test]
    fn returns_nothing_for_a_degenerate_set_with_no_volume() {
        let mut faces = Vec::new();
        // Coplanar: four corners of a square.
        assert_eq!(
            write_collision_convex_hull_faces3d(&mut faces, &vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]),
            0
        );
        // Collinear.
        assert_eq!(
            write_collision_convex_hull_faces3d(&mut faces, &vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0, 3.0, 0.0, 0.0]),
            0
        );
    }

    #[test]
    fn handles_duplicate_points_without_breaking_the_surface() {
        let mut with_duplicates: Vec<f64> = TETRAHEDRON.to_vec();
        with_duplicates.extend_from_slice(&[0.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
        let mut faces = Vec::new();
        let count = write_collision_convex_hull_faces3d(&mut faces, &with_duplicates);
        assert_eq!(count, 4);
        assert!(is_closed_surface(&faces, count));
    }
}
