//! flight-compiler: rust-only

// Large-coordinate/small-delta coverage for the f64 collision lane. Every case places geometry far
// from the origin where single precision cannot represent the tested separation (the single-precision spacing
// is 64 at 1e9 and 8 at 1e8), so these results hold only because coordinates stay f64 end to end.

use flight_collision::*;

fn polygon_square(origin: f64, x: f64) -> CollisionPolygon2D {
    return CollisionPolygon2D {
        points: vec![
            origin + x,
            origin,
            origin + x + 10.0,
            origin,
            origin + x + 10.0,
            origin + 10.0,
            origin + x,
            origin + 10.0,
        ],
    };
}

fn sphere3d(x: f64, y: f64, z: f64, radius: f64) -> CollisionShape3D {
    return CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius });
}

#[test]
fn circle_circle_resolves_a_sub_millimetre_overlap_at_one_billion() {
    let centre = 1e9;
    let a = CollisionCircle2D {
        x: centre,
        y: -centre,
        radius: 1.0,
    };
    let b = CollisionCircle2D {
        x: centre + 2.0 - 1e-4,
        y: -centre,
        radius: 1.0,
    };
    let mut out = create_collision_manifold2d();
    assert!(test_circle_circle_collision2d(&a, &b, &mut out));
    assert!((out.depth - 1e-4).abs() < 1e-6, "depth {}", out.depth);
    assert!((out.normal_x.abs() - 1.0).abs() < 1e-12);

    let apart = CollisionCircle2D {
        x: centre + 2.0 + 1e-4,
        ..b
    };
    assert!(!test_circle_circle_collision2d(&a, &apart, &mut out));
}

#[test]
fn circle_raycast_hits_at_one_billion() {
    let centre = 1e9;
    let circle = CollisionShape2D::Circle(CollisionCircle2D {
        x: centre,
        y: 0.0,
        radius: 1.0,
    });
    let mut hit = create_collision_raycast_hit2d();
    assert!(raycast_collision_shape2d(
        &mut hit,
        &circle,
        centre - 2.0,
        0.0,
        1.0,
        0.0,
        Some(5.0)
    ));
    assert_eq!((hit.fraction, hit.x), (1.0, centre - 1.0));
    assert_eq!((hit.normal_x, hit.normal_y), (-1.0, 0.0));
}

#[test]
fn polygon_sat_keeps_penetration_at_one_quadrillion() {
    let origin = 1e15;
    let a = polygon_square(origin, 0.0);
    let b = polygon_square(origin, 8.0);
    let mut out = create_collision_manifold2d();
    assert!(test_polygon_polygon_collision2d(&a, &b, &mut out));
    assert_eq!((out.depth, out.normal_x, out.normal_y), (2.0, -1.0, 0.0));
}

#[test]
fn sphere_aabb_resolves_a_ten_micrometre_penetration_at_one_hundred_million() {
    let origin = 1e8;
    let sphere = CollisionSphere3D {
        x: origin + 1.0 - 1e-5,
        y: origin + 0.5,
        z: -origin + 0.5,
        radius: 1.0,
    };
    let aabb = CollisionAabb3D {
        min_x: origin - 1.0,
        min_y: origin,
        min_z: -origin,
        max_x: origin,
        max_y: origin + 1.0,
        max_z: -origin + 1.0,
    };
    let mut out = create_collision_manifold3d();
    assert!(test_sphere_aabb_collision3d(&sphere, &aabb, &mut out));
    assert!((out.depth - 1e-5).abs() < 1e-7, "depth {}", out.depth);
}

#[test]
fn sphere_raycast_hits_at_one_billion() {
    let centre = 1e9;
    let sphere = sphere3d(centre, -centre, centre, 0.5);
    let mut hit = create_collision_raycast_hit3d();
    assert!(raycast_collision_shape3d(
        &mut hit,
        &sphere,
        centre,
        -centre,
        centre - 2.0,
        0.0,
        0.0,
        1.0,
        Some(5.0)
    ));
    assert!(
        (hit.fraction - 1.5).abs() < 1e-9,
        "fraction {}",
        hit.fraction
    );
    assert!((hit.z - (centre - 0.5)).abs() < 1e-6);
    assert!((hit.normal_z + 1.0).abs() < 1e-12);
}

#[test]
fn sphere_sphere_resolves_a_ten_micrometre_overlap_at_one_billion() {
    let centre = 1e9;
    let a = CollisionSphere3D {
        x: centre,
        y: centre,
        z: -centre,
        radius: 0.5,
    };
    let b = CollisionSphere3D {
        x: centre,
        y: centre + 1.0 - 1e-5,
        z: -centre,
        radius: 0.5,
    };
    let mut out = create_collision_manifold3d();
    assert!(test_sphere_sphere_collision3d(&a, &b, &mut out));
    assert!((out.depth - 1e-5).abs() < 1e-6, "depth {}", out.depth);
    assert!((out.normal_y.abs() - 1.0).abs() < 1e-12);
}

#[test]
fn support_distance_measures_a_millimetre_gap_at_one_billion() {
    let centre = 1e9;
    let registry = crate::collision_registry3d_with_supports();
    let a = sphere3d(centre, centre, centre, 1.0);
    let b = sphere3d(centre + 2.0 + 1e-3, centre, centre, 1.0);
    let mut out = create_collision_distance3d();
    assert!(write_collision_distance3d(
        &mut out, &registry, &a, &b, None, None, None
    ));
    assert!(!out.overlapping);
    assert!(
        (out.distance - 1e-3).abs() < 1e-6,
        "distance {}",
        out.distance
    );
}
