use crate::types::*;

// flight-lint: allow(f64) validated input is the measured 1e15 polygon storage domain retained for SAT
pub fn get_collision_polygon_validation_status2d(points: &Vec<f64>) -> Option<CollisionTestStatus> {
    if points.len() < 6 || points.len() % 2 != 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for point in points.chunks_exact(2) {
        let x = point[0];
        let y = point[1];
        if !x.is_finite() || !y.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }
    let extent = (max_x - min_x).max(max_y - min_y);
    if extent <= 0.0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let cross_epsilon = extent * extent * 1e-12;
    let x_origin = points[0];
    let y_origin = points[1];
    let mut area_twice = 0.0;
    let mut turn_sign = 0;
    let count = points.len() / 2;
    for i in 0..count {
        let previous = (i + count - 1) % count;
        let next = (i + 1) % count;
        let x = points[i * 2] - x_origin;
        let y = points[i * 2 + 1] - y_origin;
        let next_x = points[next * 2] - x_origin;
        let next_y = points[next * 2 + 1] - y_origin;
        area_twice += x * next_y - y * next_x;

        let ax = x - (points[previous * 2] - x_origin);
        let ay = y - (points[previous * 2 + 1] - y_origin);
        let bx = next_x - x;
        let by = next_y - y;
        let cross = ax * by - ay * bx;
        if cross.abs() <= cross_epsilon {
            continue;
        }
        let sign = if cross > 0.0 { 1 } else { -1 };
        if turn_sign != 0 && sign != turn_sign {
            return Some(CollisionTestStatus::NonConvexPolygon);
        }
        turn_sign = sign;
    }
    if area_twice.abs() <= cross_epsilon || turn_sign == 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    return None;
}

pub fn get_collision_shape_validation_status2d(
    shape: &CollisionShape2D,
) -> Option<CollisionTestStatus> {
    match shape {
        CollisionShape2D::Circle(c) => {
            if !c.x.is_finite() || !c.y.is_finite() || !c.radius.is_finite() || c.radius <= 0.0 {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape2D::Aabb(a) => {
            if !a.min_x.is_finite()
                || !a.min_y.is_finite()
                || !a.max_x.is_finite()
                || !a.max_y.is_finite()
                || a.max_x <= a.min_x
                || a.max_y <= a.min_y
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape2D::Obb(o) => {
            if !o.x.is_finite()
                || !o.y.is_finite()
                || !o.half_w.is_finite()
                || !o.half_h.is_finite()
                || !o.rotation.is_finite()
                || o.half_w <= 0.0
                || o.half_h <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape2D::Polygon(p) => {
            return get_collision_polygon_validation_status2d(&p.points);
        }
        CollisionShape2D::Capsule(c) => {
            if !c.x0.is_finite()
                || !c.y0.is_finite()
                || !c.x1.is_finite()
                || !c.y1.is_finite()
                || !c.radius.is_finite()
                || c.radius <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape2D::Segment(s) => {
            if !s.x0.is_finite()
                || !s.y0.is_finite()
                || !s.x1.is_finite()
                || !s.y1.is_finite()
                || (s.x0 == s.x1 && s.y0 == s.y1)
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return Some(CollisionTestStatus::UnsupportedShapeKind);
        }
        CollisionShape2D::Point(p) => {
            if !p.x.is_finite() || !p.y.is_finite() {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return Some(CollisionTestStatus::UnsupportedShapeKind);
        }
    }
}
