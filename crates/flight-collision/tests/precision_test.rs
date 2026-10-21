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

fn round_f32(value: f64) -> f64 {
    return value as f32 as f64;
}

fn round_polygon_f32(polygon: &CollisionPolygon2D) -> CollisionPolygon2D {
    return CollisionPolygon2D {
        points: polygon
            .points
            .iter()
            .map(|value| round_f32(*value))
            .collect(),
    };
}

#[test]
fn polygon_sat_f32_is_sufficient_locally_but_collapses_large_world_extents() {
    let local_a = polygon_square(0.0, 0.0);
    let local_b = polygon_square(0.0, 8.0);
    let mut local_f64 = create_collision_manifold2d();
    let mut local_f32 = create_collision_manifold2d();
    assert!(test_polygon_polygon_collision2d(
        &local_a,
        &local_b,
        &mut local_f64,
    ));
    assert!(test_polygon_polygon_collision2d(
        &round_polygon_f32(&local_a),
        &round_polygon_f32(&local_b),
        &mut local_f32,
    ));
    assert_eq!(
        (local_f64.depth, local_f64.normal_x, local_f64.normal_y),
        (local_f32.depth, local_f32.normal_x, local_f32.normal_y),
    );

    let world_origin = 1e15;
    let world_a = polygon_square(world_origin, 0.0);
    let world_b = polygon_square(world_origin, 8.0);
    let mut world_f64 = create_collision_manifold2d();
    let mut world_f32 = create_collision_manifold2d();
    assert!(test_polygon_polygon_collision2d(
        &world_a,
        &world_b,
        &mut world_f64,
    ));
    assert_eq!(
        (world_f64.depth, world_f64.normal_x, world_f64.normal_y),
        (2.0, -1.0, 0.0),
    );

    let rounded_a = round_polygon_f32(&world_a);
    let rounded_b = round_polygon_f32(&world_b);
    assert!(rounded_a.points.windows(2).all(|pair| pair[0] == pair[1]));
    assert!(rounded_b.points.windows(2).all(|pair| pair[0] == pair[1]));
    assert!(!test_polygon_polygon_collision2d(
        &rounded_a,
        &rounded_b,
        &mut world_f32,
    ));
}

#[test]
fn circle_raycast_f32_is_sufficient_locally_but_aliases_high_coordinates() {
    let local_circle = CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 1.0,
    });
    let mut local_f64 = create_collision_raycast_hit2d();
    let mut local_f32 = create_collision_raycast_hit2d();
    assert!(raycast_collision_shape2d(
        &mut local_f64,
        &local_circle,
        -2.0,
        0.0,
        1.0,
        0.0,
        Some(5.0)
    ));
    assert!(raycast_collision_shape2d(
        &mut local_f32,
        &local_circle,
        round_f32(-2.0),
        0.0,
        1.0,
        0.0,
        Some(5.0)
    ));
    assert_eq!(
        (local_f64.fraction, local_f64.x, local_f64.normal_x),
        (local_f32.fraction, local_f32.x, local_f32.normal_x),
    );

    let center = 1e9;
    let world_circle = CollisionShape2D::Circle(CollisionCircle2D {
        x: center,
        y: 0.0,
        radius: 1.0,
    });
    let mut world_f64 = create_collision_raycast_hit2d();
    assert!(raycast_collision_shape2d(
        &mut world_f64,
        &world_circle,
        center - 2.0,
        0.0,
        1.0,
        0.0,
        Some(5.0)
    ));
    assert_eq!((world_f64.fraction, world_f64.x), (1.0, center - 1.0));

    let rounded_center = round_f32(center);
    let rounded_origin = round_f32(center - 2.0);
    assert_eq!(rounded_origin, rounded_center);
    let rounded_circle = CollisionShape2D::Circle(CollisionCircle2D {
        x: rounded_center,
        y: 0.0,
        radius: 1.0,
    });
    let mut world_f32 = create_collision_raycast_hit2d();
    // Pinned raycastCollisionShape2D.ts:35-51 reports an origin inside the shape at fraction zero, so
    // the f32-rounded origin aliasing onto the centre is a fraction-0 inside hit rather than a miss.
    // The aliasing itself is the documented expectation: the f64 query reports fraction 1.
    assert!(raycast_collision_shape2d(
        &mut world_f32,
        &rounded_circle,
        rounded_origin,
        0.0,
        1.0,
        0.0,
        Some(5.0)
    ));
    assert_eq!((world_f32.fraction, world_f32.x), (0.0, rounded_center));
}

#[test]
fn guard_clock_needs_f64_to_distinguish_one_millisecond_after_two_to_the_24() {
    let timestamp = 16_777_216.0_f64;
    assert_ne!(timestamp, timestamp + 1.0);
    assert_eq!(round_f32(timestamp), round_f32(timestamp + 1.0));
}
