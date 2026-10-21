use super::*;

#[test]
fn returns_the_capsule_endpoint_furthest_along_the_direction_plus_radius() {
    let capsule = CollisionCapsule2D {
        x0: 0.0,
        y0: 0.0,
        x1: 10.0,
        y1: 0.0,
        radius: 1.0,
    };
    let mut out = [0.0_f32; 2];
    support_collision_capsule2d(&capsule, 1.0, 0.0, &mut out);
    assert_eq!(out, [11.0, 0.0]);
    support_collision_capsule2d(&capsule, -1.0, 0.0, &mut out);
    assert_eq!(out, [-1.0, 0.0]);
}
