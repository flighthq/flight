use crate::types::*;

pub fn get_collision_polygon_validation_status2d(points: &[f64]) -> Option<CollisionTestStatus> {
    let count = points.len() / 2;
    if count < 3 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    for i in 0..points.len() {
        if !points[i].is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
    }
    let mut has_positive = false;
    let mut has_negative = false;
    for i in 0..count {
        let j = (i + 1) % count;
        let k = (i + 2) % count;
        let x0 = points[i * 2];
        let y0 = points[i * 2 + 1];
        let x1 = points[j * 2];
        let y1 = points[j * 2 + 1];
        let x2 = points[k * 2];
        let y2 = points[k * 2 + 1];
        let cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
        if cross > 0.0 {
            has_positive = true;
        }
        if cross < 0.0 {
            has_negative = true;
        }
        if has_positive && has_negative {
            return Some(CollisionTestStatus::NonConvexPolygon);
        }
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
            if !s.x0.is_finite() || !s.y0.is_finite() || !s.x1.is_finite() || !s.y1.is_finite() {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape2D::Point(p) => {
            if !p.x.is_finite() || !p.y.is_finite() {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
    }
}
