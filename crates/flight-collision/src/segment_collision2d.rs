use crate::collision_shape_validation2d::get_collision_polygon_validation_status2d;
use crate::types::*;

const RELATIVE_EPSILON: f32 = 1e-9;

fn clip_segment_slab(p: f32, q: f32, epsilon: f32, t0: &mut f32, t1: &mut f32) -> bool {
    if p.abs() <= epsilon {
        return q >= -epsilon;
    }
    let r = q / p;
    if p < 0.0 {
        if r > *t1 {
            return false;
        }
        if r > *t0 {
            *t0 = r;
        }
    } else {
        if r < *t0 {
            return false;
        }
        if r < *t1 {
            *t1 = r;
        }
    }
    return true;
}

fn get_polygon_extent(points: &[f32], count: usize) -> f32 {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for index in 0..count {
        let x = points[index * 2];
        let y = points[index * 2 + 1];
        if x < min_x {
            min_x = x;
        }
        if x > max_x {
            max_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }
    }
    return (max_x - min_x).max(max_y - min_y);
}

fn is_point_in_convex_polygon(x: f32, y: f32, points: &[f32], count: usize) -> bool {
    let epsilon = relative_epsilon(get_polygon_extent(points, count));
    let mut positive = false;
    let mut negative = false;
    for index in 0..count {
        let next = (index + 1) % count;
        let x0 = points[index * 2];
        let y0 = points[index * 2 + 1];
        let x1 = points[next * 2];
        let y1 = points[next * 2 + 1];
        let cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
        let edge_epsilon = (x1 - x0).hypot(y1 - y0) * epsilon;
        if cross > edge_epsilon {
            positive = true;
        } else if cross < -edge_epsilon {
            negative = true;
        }
        if positive && negative {
            return false;
        }
    }
    return true;
}

fn is_point_on_segment(x: f32, y: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> bool {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_squared = dx * dx + dy * dy;
    if length_squared == 0.0 {
        return x == x0 && y == y0;
    }
    let t = (((x - x0) * dx + (y - y0) * dy) / length_squared).clamp(0.0, 1.0);
    let distance_x = x - (x0 + t * dx);
    let distance_y = y - (y0 + t * dy);
    let epsilon = relative_epsilon(length_squared.sqrt());
    return distance_x * distance_x + distance_y * distance_y <= epsilon * epsilon;
}

fn is_segment_overlapping_box(
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    min_x: f32,
    min_y: f32,
    max_x: f32,
    max_y: f32,
) -> bool {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let epsilon = relative_epsilon(dx.abs().max(dy.abs()).max(max_x - min_x).max(max_y - min_y));
    let mut t0 = 0.0;
    let mut t1 = 1.0;
    if !clip_segment_slab(-dx, x0 - min_x, epsilon, &mut t0, &mut t1) {
        return false;
    }
    if !clip_segment_slab(dx, max_x - x0, epsilon, &mut t0, &mut t1) {
        return false;
    }
    if !clip_segment_slab(-dy, y0 - min_y, epsilon, &mut t0, &mut t1) {
        return false;
    }
    if !clip_segment_slab(dy, max_y - y0, epsilon, &mut t0, &mut t1) {
        return false;
    }
    return t0 <= t1;
}

fn is_segments_intersecting(
    ax0: f32,
    ay0: f32,
    ax1: f32,
    ay1: f32,
    bx0: f32,
    by0: f32,
    bx1: f32,
    by1: f32,
) -> bool {
    let direction_a_x = ax1 - ax0;
    let direction_a_y = ay1 - ay0;
    let direction_b_x = bx1 - bx0;
    let direction_b_y = by1 - by0;
    let denominator = direction_a_x * direction_b_y - direction_a_y * direction_b_x;
    let offset_x = bx0 - ax0;
    let offset_y = by0 - ay0;
    let length_a_squared = direction_a_x * direction_a_x + direction_a_y * direction_a_y;
    let length_b_squared = direction_b_x * direction_b_x + direction_b_y * direction_b_y;
    if length_a_squared == 0.0 {
        return is_point_on_segment(ax0, ay0, bx0, by0, bx1, by1);
    }
    if length_b_squared == 0.0 {
        return is_point_on_segment(bx0, by0, ax0, ay0, ax1, ay1);
    }
    if denominator * denominator
        <= RELATIVE_EPSILON * RELATIVE_EPSILON * length_a_squared * length_b_squared
    {
        let epsilon = relative_epsilon(length_a_squared.sqrt().max(length_b_squared.sqrt()));
        if (offset_x * direction_a_y - offset_y * direction_a_x).abs()
            > length_a_squared.sqrt() * epsilon
        {
            return false;
        }
        let projection0 = (offset_x * direction_a_x + offset_y * direction_a_y) / length_a_squared;
        let projection1 =
            ((bx1 - ax0) * direction_a_x + (by1 - ay0) * direction_a_y) / length_a_squared;
        let low = projection0.min(projection1);
        let high = projection0.max(projection1);
        return high >= -RELATIVE_EPSILON && low <= 1.0 + RELATIVE_EPSILON;
    }
    let t = (offset_x * direction_b_y - offset_y * direction_b_x) / denominator;
    let u = (offset_x * direction_a_y - offset_y * direction_a_x) / denominator;
    return (-RELATIVE_EPSILON..=1.0 + RELATIVE_EPSILON).contains(&t)
        && (-RELATIVE_EPSILON..=1.0 + RELATIVE_EPSILON).contains(&u);
}

fn is_valid_aabb(shape: &CollisionAabb2D) -> bool {
    return shape.min_x.is_finite()
        && shape.min_y.is_finite()
        && shape.max_x.is_finite()
        && shape.max_y.is_finite()
        && shape.max_x > shape.min_x
        && shape.max_y > shape.min_y;
}

fn is_valid_capsule(shape: &CollisionCapsule2D) -> bool {
    return shape.x0.is_finite()
        && shape.y0.is_finite()
        && shape.x1.is_finite()
        && shape.y1.is_finite()
        && shape.radius.is_finite()
        && shape.radius > 0.0;
}

fn is_valid_circle(shape: &CollisionCircle2D) -> bool {
    return shape.x.is_finite()
        && shape.y.is_finite()
        && shape.radius.is_finite()
        && shape.radius > 0.0;
}

fn is_valid_obb(shape: &CollisionObb2D) -> bool {
    return shape.x.is_finite()
        && shape.y.is_finite()
        && shape.half_w.is_finite()
        && shape.half_h.is_finite()
        && shape.rotation.is_finite()
        && shape.half_w > 0.0
        && shape.half_h > 0.0;
}

fn point_segment_distance_squared(
    point_x: f32,
    point_y: f32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0;
    if length_squared > 0.0 {
        t = (((point_x - x0) * dx + (point_y - y0) * dy) / length_squared).clamp(0.0, 1.0);
    }
    let closest_x = point_x - (x0 + t * dx);
    let closest_y = point_y - (y0 + t * dy);
    return closest_x * closest_x + closest_y * closest_y;
}

fn relative_epsilon(extent: f32) -> f32 {
    return if extent > 0.0 {
        extent * RELATIVE_EPSILON
    } else {
        f32::EPSILON
    };
}

fn segment_segment_distance_squared(
    ax0: f32,
    ay0: f32,
    ax1: f32,
    ay1: f32,
    bx0: f32,
    by0: f32,
    bx1: f32,
    by1: f32,
) -> f32 {
    if is_segments_intersecting(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
        return 0.0;
    }
    return point_segment_distance_squared(ax0, ay0, bx0, by0, bx1, by1)
        .min(point_segment_distance_squared(ax1, ay1, bx0, by0, bx1, by1))
        .min(point_segment_distance_squared(bx0, by0, ax0, ay0, ax1, ay1))
        .min(point_segment_distance_squared(bx1, by1, ax0, ay0, ax1, ay1));
}

/// Whether a segment overlaps an axis-aligned box, boundary-inclusive.
pub fn test_segment_aabb_collision2d(a: &CollisionSegment2D, b: &CollisionAabb2D) -> bool {
    if !is_valid_aabb(b) {
        return false;
    }
    return is_segment_overlapping_box(
        a.x0 as f32,
        a.y0 as f32,
        a.x1 as f32,
        a.y1 as f32,
        b.min_x as f32,
        b.min_y as f32,
        b.max_x as f32,
        b.max_y as f32,
    );
}

/// Whether a segment comes within the radius of a capsule axis, boundary-inclusive.
pub fn test_segment_capsule_collision2d(a: &CollisionSegment2D, b: &CollisionCapsule2D) -> bool {
    if !is_valid_capsule(b) {
        return false;
    }
    let distance_squared = segment_segment_distance_squared(
        a.x0 as f32,
        a.y0 as f32,
        a.x1 as f32,
        a.y1 as f32,
        b.x0 as f32,
        b.y0 as f32,
        b.x1 as f32,
        b.y1 as f32,
    );
    let radius = b.radius as f32;
    return distance_squared <= radius * radius;
}

/// Whether the closest point on a segment is within a circle, boundary-inclusive.
pub fn test_segment_circle_collision2d(a: &CollisionSegment2D, b: &CollisionCircle2D) -> bool {
    if !is_valid_circle(b) {
        return false;
    }
    let x0 = a.x0 as f32;
    let y0 = a.y0 as f32;
    let dx = a.x1 as f32 - x0;
    let dy = a.y1 as f32 - y0;
    let circle_x = b.x as f32;
    let circle_y = b.y as f32;
    let radius = b.radius as f32;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0;
    if length_squared > 0.0 {
        t = (((circle_x - x0) * dx + (circle_y - y0) * dy) / length_squared).clamp(0.0, 1.0);
    }
    let closest_x = x0 + t * dx;
    let closest_y = y0 + t * dy;
    let distance_x = circle_x - closest_x;
    let distance_y = circle_y - closest_y;
    return distance_x * distance_x + distance_y * distance_y <= radius * radius;
}

/// Whether a segment overlaps an oriented box, boundary-inclusive.
pub fn test_segment_obb_collision2d(a: &CollisionSegment2D, b: &CollisionObb2D) -> bool {
    if !is_valid_obb(b) {
        return false;
    }
    let rotation = b.rotation as f32;
    let cos = rotation.cos();
    let sin = rotation.sin();
    let delta0_x = a.x0 as f32 - b.x as f32;
    let delta0_y = a.y0 as f32 - b.y as f32;
    let delta1_x = a.x1 as f32 - b.x as f32;
    let delta1_y = a.y1 as f32 - b.y as f32;
    let local_x0 = delta0_x * cos + delta0_y * sin;
    let local_y0 = -delta0_x * sin + delta0_y * cos;
    let local_x1 = delta1_x * cos + delta1_y * sin;
    let local_y1 = -delta1_x * sin + delta1_y * cos;
    return is_segment_overlapping_box(
        local_x0,
        local_y0,
        local_x1,
        local_y1,
        -(b.half_w as f32),
        -(b.half_h as f32),
        b.half_w as f32,
        b.half_h as f32,
    );
}

/// Whether a segment overlaps a valid convex polygon, boundary-inclusive.
pub fn test_segment_polygon_collision2d(a: &CollisionSegment2D, b: &CollisionPolygon2D) -> bool {
    if get_collision_polygon_validation_status2d(&b.points).is_some() {
        return false;
    }
    let points: Vec<_> = b.points.iter().map(|value| *value as f32).collect();
    let count = points.len() / 2;
    if is_point_in_convex_polygon(a.x0 as f32, a.y0 as f32, &points, count)
        || is_point_in_convex_polygon(a.x1 as f32, a.y1 as f32, &points, count)
    {
        return true;
    }
    for index in 0..count {
        let next = (index + 1) % count;
        if is_segments_intersecting(
            a.x0 as f32,
            a.y0 as f32,
            a.x1 as f32,
            a.y1 as f32,
            points[index * 2],
            points[index * 2 + 1],
            points[next * 2],
            points[next * 2 + 1],
        ) {
            return true;
        }
    }
    return false;
}

/// Whether two segments cross, touch or overlap collinearly.
pub fn test_segment_segment_collision2d(a: &CollisionSegment2D, b: &CollisionSegment2D) -> bool {
    return is_segments_intersecting(
        a.x0 as f32,
        a.y0 as f32,
        a.x1 as f32,
        a.y1 as f32,
        b.x0 as f32,
        b.y0 as f32,
        b.x1 as f32,
        b.y1 as f32,
    );
}
