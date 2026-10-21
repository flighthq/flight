use crate::types::*;

pub fn get_collision_convex_validation_status3d(points: &Vec<f32>) -> Option<CollisionTestStatus> {
    if points.len() < 9 || points.len() % 3 != 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for point in points.chunks_exact(3) {
        let x = point[0];
        let y = point[1];
        let z = point[2];
        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        min_z = min_z.min(z);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
        max_z = max_z.max(z);
    }
    if (max_x - min_x).max(max_y - min_y).max(max_z - min_z) <= 0.0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    return None;
}

pub fn get_collision_shape_validation_status3d(
    shape: &CollisionShape3D,
) -> Option<CollisionTestStatus> {
    match shape {
        CollisionShape3D::Sphere(s) => {
            if !s.x.is_finite()
                || !s.y.is_finite()
                || !s.z.is_finite()
                || !s.radius.is_finite()
                || s.radius <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Aabb(a) => {
            if !a.min_x.is_finite()
                || !a.min_y.is_finite()
                || !a.min_z.is_finite()
                || !a.max_x.is_finite()
                || !a.max_y.is_finite()
                || !a.max_z.is_finite()
                || a.max_x <= a.min_x
                || a.max_y <= a.min_y
                || a.max_z <= a.min_z
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Box(b) => {
            if !b.x.is_finite()
                || !b.y.is_finite()
                || !b.z.is_finite()
                || !b.half_x.is_finite()
                || !b.half_y.is_finite()
                || !b.half_z.is_finite()
                || b.half_x <= 0.0
                || b.half_y <= 0.0
                || b.half_z <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            let q_len_sq = b.rotation_x * b.rotation_x
                + b.rotation_y * b.rotation_y
                + b.rotation_z * b.rotation_z
                + b.rotation_w * b.rotation_w;
            if !q_len_sq.is_finite() || q_len_sq <= 0.0 {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Capsule(c) => {
            if !c.x0.is_finite()
                || !c.y0.is_finite()
                || !c.z0.is_finite()
                || !c.x1.is_finite()
                || !c.y1.is_finite()
                || !c.z1.is_finite()
                || !c.radius.is_finite()
                || c.radius <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Cylinder(c) => {
            if !c.x0.is_finite()
                || !c.y0.is_finite()
                || !c.z0.is_finite()
                || !c.x1.is_finite()
                || !c.y1.is_finite()
                || !c.z1.is_finite()
                || !c.radius.is_finite()
                || c.radius <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            let dx = c.x1 - c.x0;
            let dy = c.y1 - c.y0;
            let dz = c.z1 - c.z0;
            if dx * dx + dy * dy + dz * dz <= 0.0 {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Cone(c) => {
            if !c.x0.is_finite()
                || !c.y0.is_finite()
                || !c.z0.is_finite()
                || !c.x1.is_finite()
                || !c.y1.is_finite()
                || !c.z1.is_finite()
                || !c.radius.is_finite()
                || c.radius <= 0.0
            {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            let dx = c.x1 - c.x0;
            let dy = c.y1 - c.y0;
            let dz = c.z1 - c.z0;
            if dx * dx + dy * dy + dz * dz <= 0.0 {
                return Some(CollisionTestStatus::DegenerateShape);
            }
            return None;
        }
        CollisionShape3D::Convex(c) => {
            return get_collision_convex_validation_status3d(&c.points);
        }
    }
}
