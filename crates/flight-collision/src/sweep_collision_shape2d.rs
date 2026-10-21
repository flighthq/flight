use crate::collide_contact_manifold2d::*;
use crate::collision_shape_validation2d::*;
use crate::contact_manifold2d::*;
use crate::convex_vertices2d::*;
use crate::types::*;

const SWEEP_EPSILON: f32 = 1e-9;
const SWEEP_TOUCH_TOLERANCE: f32 = 1e-6;

/// One convex piece of a swept shape.
struct SweepPiece {
    x: f32,
    y: f32,
    radius: f32,
    vertices: Option<Vec<f32>>,
}

pub fn create_collision_time_of_impact2d() -> CollisionTimeOfImpact2D {
    let mut out: CollisionTimeOfImpact2D = flight_entity::allocate_entity();
    initialize_collision_time_of_impact2d(&mut out);
    return out;
}

pub fn initialize_collision_time_of_impact2d(out: &mut CollisionTimeOfImpact2D) {
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
}

fn canonical_zero(value: f32) -> f32 {
    return if value == 0.0 { 0.0 } else { value };
}

fn polygon_area_twice(vertices: &[f32]) -> f32 {
    let mut area = 0.0_f32;
    let count = vertices.len() / 2;
    for i in 0..count {
        let next = (i + 1) % count;
        area += vertices[i * 2] * vertices[next * 2 + 1] - vertices[next * 2] * vertices[i * 2 + 1];
    }
    return area;
}

fn project_vertices(vertices: &[f32], axis_x: f32, axis_y: f32) -> (f32, f32) {
    let mut min = f32::INFINITY;
    let mut max = f32::NEG_INFINITY;
    let mut i = 0;
    while i < vertices.len() {
        let projection = vertices[i] * axis_x + vertices[i + 1] * axis_y;
        if projection < min {
            min = projection;
        }
        if projection > max {
            max = projection;
        }
        i += 2;
    }
    return (min, max);
}

fn ray_circle_fraction(
    origin_x: f32,
    origin_y: f32,
    direction_x: f32,
    direction_y: f32,
    center_x: f32,
    center_y: f32,
    radius: f32,
) -> f32 {
    let quadratic_a = direction_x * direction_x + direction_y * direction_y;
    if !(quadratic_a > 0.0) {
        return -1.0;
    }
    let offset_x = origin_x - center_x;
    let offset_y = origin_y - center_y;
    let quadratic_b = 2.0 * (offset_x * direction_x + offset_y * direction_y);
    let quadratic_c = offset_x * offset_x + offset_y * offset_y - radius * radius;
    let discriminant = quadratic_b * quadratic_b - 4.0 * quadratic_a * quadratic_c;
    if discriminant < 0.0 {
        return -1.0;
    }
    return (-quadratic_b - discriminant.sqrt()) / (2.0 * quadratic_a);
}

fn sweep_capsule_pair(
    shape_a: &CollisionShape2D,
    shape_b: &CollisionShape2D,
    velocity_x: f32,
    velocity_y: f32,
    max_fraction: f32,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    let pieces_a = write_capsule_pieces(shape_a);
    let pieces_b = write_capsule_pieces(shape_b);
    if pieces_a.is_empty() || pieces_b.is_empty() {
        return false;
    }
    let mut hit = false;
    let mut best_fraction = f32::INFINITY;
    for piece_a in &pieces_a {
        for piece_b in &pieces_b {
            let mut piece_hit = create_collision_time_of_impact2d();
            if !sweep_piece_pair(
                piece_a,
                piece_b,
                velocity_x,
                velocity_y,
                max_fraction,
                &mut piece_hit,
            ) {
                continue;
            }
            if piece_hit.fraction >= best_fraction {
                continue;
            }
            best_fraction = piece_hit.fraction;
            hit = true;
            out.fraction = piece_hit.fraction;
            out.normal_x = piece_hit.normal_x;
            out.normal_y = piece_hit.normal_y;
            out.x = piece_hit.x;
            out.y = piece_hit.y;
        }
    }
    return hit;
}

fn sweep_circle_circle(
    a: &CollisionCircle2D,
    b: &CollisionCircle2D,
    velocity_x: f32,
    velocity_y: f32,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    let offset_x = a.x as f32 - b.x as f32;
    let offset_y = a.y as f32 - b.y as f32;
    let radius = a.radius as f32 + b.radius as f32;
    let quadratic_a = velocity_x * velocity_x + velocity_y * velocity_y;
    if !(quadratic_a > 0.0) {
        return false;
    }
    let quadratic_b = 2.0 * (offset_x * velocity_x + offset_y * velocity_y);
    let quadratic_c = offset_x * offset_x + offset_y * offset_y - radius * radius;
    let discriminant = quadratic_b * quadratic_b - 4.0 * quadratic_a * quadratic_c;
    if discriminant < 0.0 {
        return false;
    }
    let fraction = (-quadratic_b - discriminant.sqrt()) / (2.0 * quadratic_a);
    if fraction < 0.0 {
        return false;
    }
    let normal_x = offset_x + velocity_x * fraction;
    let normal_y = offset_y + velocity_y * fraction;
    let length = (normal_x * normal_x + normal_y * normal_y).sqrt();
    if !(length > 0.0) {
        return false;
    }
    out.fraction = fraction;
    out.normal_x = normal_x / length;
    out.normal_y = normal_y / length;
    return true;
}

fn sweep_circle_polygon(
    circle: &CollisionCircle2D,
    vertices: &[f32],
    velocity_x: f32,
    velocity_y: f32,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    let center_x = circle.x as f32;
    let center_y = circle.y as f32;
    let radius = circle.radius as f32;
    let mut best_fraction = f32::INFINITY;
    let mut best_normal_x = 0.0_f32;
    let mut best_normal_y = 0.0_f32;
    let count = vertices.len() / 2;
    let winding = if polygon_area_twice(vertices) >= 0.0 {
        1.0_f32
    } else {
        -1.0_f32
    };

    for i in 0..count {
        let next = (i + 1) % count;
        let x0 = vertices[i * 2];
        let y0 = vertices[i * 2 + 1];
        let x1 = vertices[next * 2];
        let y1 = vertices[next * 2 + 1];
        let edge_x = x1 - x0;
        let edge_y = y1 - y0;
        let edge_length = (edge_x * edge_x + edge_y * edge_y).sqrt();
        if !(edge_length > 0.0) {
            continue;
        }
        let normal_x = (winding * edge_y) / edge_length;
        let normal_y = (-winding * edge_x) / edge_length;
        let speed = normal_x * velocity_x + normal_y * velocity_y;
        let separation = normal_x * (center_x - x0) + normal_y * (center_y - y0);
        if speed < 0.0 && separation >= radius {
            let fraction = (radius - separation) / speed;
            let hit_center_x = center_x + velocity_x * fraction;
            let hit_center_y = center_y + velocity_y * fraction;
            let edge_fraction = ((hit_center_x - x0) * edge_x + (hit_center_y - y0) * edge_y)
                / (edge_length * edge_length);
            if fraction >= 0.0
                && edge_fraction >= 0.0
                && edge_fraction <= 1.0
                && fraction < best_fraction
            {
                best_fraction = fraction;
                best_normal_x = normal_x;
                best_normal_y = normal_y;
            }
        }

        let vertex_fraction =
            ray_circle_fraction(center_x, center_y, velocity_x, velocity_y, x0, y0, radius);
        if vertex_fraction >= 0.0 && vertex_fraction < best_fraction {
            let hit_x = center_x + velocity_x * vertex_fraction;
            let hit_y = center_y + velocity_y * vertex_fraction;
            let normal_length = ((hit_x - x0) * (hit_x - x0) + (hit_y - y0) * (hit_y - y0)).sqrt();
            if normal_length > 0.0 {
                best_fraction = vertex_fraction;
                best_normal_x = (hit_x - x0) / normal_length;
                best_normal_y = (hit_y - y0) / normal_length;
            }
        }
    }

    if !best_fraction.is_finite() {
        return false;
    }
    out.fraction = best_fraction;
    out.normal_x = best_normal_x;
    out.normal_y = best_normal_y;
    return true;
}

/// Finds the exact first contact under linear translation of both shapes (TS
/// `sweepCollisionShape2D`). Circle-circle uses its quadratic root, circle-polygon uses the polygon's
/// rounded face/vertex expansion, polygon pairs use continuous SAT, and a capsule sweeps as the union
/// of its two end discs and body rectangle (the earliest piece hit). Point/segment and invalid/custom
/// kinds fail closed and fully clear `out`.
// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first; the registry remains in the signature for API stability though the analytic source path needs no dispatch table
pub fn sweep_collision_shape2d(
    out: &mut CollisionTimeOfImpact2D,
    _registry: &CollisionRegistry2D,
    shape_a: &CollisionShape2D,
    translation_ax: f32,
    translation_ay: f32,
    shape_b: &CollisionShape2D,
    translation_bx: f32,
    translation_by: f32,
    max_fraction: Option<f32>,
) -> bool {
    initialize_collision_time_of_impact2d(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    if !translation_ax.is_finite()
        || !translation_ay.is_finite()
        || !translation_bx.is_finite()
        || !translation_by.is_finite()
        || !max_fraction.is_finite()
        || max_fraction < 0.0
        || get_collision_shape_validation_status2d(shape_a).is_some()
        || get_collision_shape_validation_status2d(shape_b).is_some()
    {
        return false;
    }

    let mut manifold = create_collision_contact_manifold2d();
    if collide_contact_manifold2d(shape_a, shape_b, &mut manifold) {
        out.normal_x = canonical_zero(manifold.normal_x);
        out.normal_y = canonical_zero(manifold.normal_y);
        write_shape_a_support(shape_a, 0.0, 0.0, out);
        return true;
    }

    let relative_x = translation_ax - translation_bx;
    let relative_y = translation_ay - translation_by;
    let mut hit = false;
    // Capsules are tested BEFORE the circle branches: a capsule has no polygon vertices, so a
    // circle-versus-capsule pair routed through the circle path would ask the capsule for vertices,
    // get none, and report a clean miss (a tunnelled bullet).
    if matches!(shape_a, CollisionShape2D::Capsule(_))
        || matches!(shape_b, CollisionShape2D::Capsule(_))
    {
        hit = sweep_capsule_pair(shape_a, shape_b, relative_x, relative_y, max_fraction, out);
    } else if let CollisionShape2D::Circle(circle_a) = shape_a {
        if let CollisionShape2D::Circle(circle_b) = shape_b {
            hit = sweep_circle_circle(circle_a, circle_b, relative_x, relative_y, out);
        } else if let Some(vertices_b) = write_shape_vertices(shape_b) {
            hit = sweep_circle_polygon(circle_a, &vertices_b, relative_x, relative_y, out);
        }
    } else if let CollisionShape2D::Circle(circle_b) = shape_b {
        if let Some(vertices_a) = write_shape_vertices(shape_a) {
            hit = sweep_circle_polygon(circle_b, &vertices_a, -relative_x, -relative_y, out);
            if hit {
                out.normal_x = -out.normal_x;
                out.normal_y = -out.normal_y;
            }
        }
    } else if let (Some(vertices_a), Some(vertices_b)) =
        (write_shape_vertices(shape_a), write_shape_vertices(shape_b))
    {
        hit = sweep_polygon_polygon(
            &vertices_a,
            &vertices_b,
            relative_x,
            relative_y,
            max_fraction,
            out,
        );
    }

    if !hit || out.fraction < 0.0 || out.fraction > max_fraction {
        initialize_collision_time_of_impact2d(out);
        return false;
    }
    out.normal_x = canonical_zero(out.normal_x);
    out.normal_y = canonical_zero(out.normal_y);
    write_shape_a_support(
        shape_a,
        translation_ax * out.fraction,
        translation_ay * out.fraction,
        out,
    );
    return true;
}

// flight-lint: allow(f64) canonical circle storage is f64; the capsule piece boundary converts through it
fn sweep_piece_pair(
    a: &SweepPiece,
    b: &SweepPiece,
    velocity_x: f32,
    velocity_y: f32,
    max_fraction: f32,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    match (&a.vertices, &b.vertices) {
        (None, None) => {
            let circle_a = CollisionCircle2D {
                x: a.x as f64,
                y: a.y as f64,
                radius: a.radius as f64,
            };
            let circle_b = CollisionCircle2D {
                x: b.x as f64,
                y: b.y as f64,
                radius: b.radius as f64,
            };
            return sweep_circle_circle(&circle_a, &circle_b, velocity_x, velocity_y, out);
        }
        (None, Some(vertices_b)) => {
            let circle_a = CollisionCircle2D {
                x: a.x as f64,
                y: a.y as f64,
                radius: a.radius as f64,
            };
            return sweep_circle_polygon(&circle_a, vertices_b, velocity_x, velocity_y, out);
        }
        (Some(vertices_a), None) => {
            let circle_b = CollisionCircle2D {
                x: b.x as f64,
                y: b.y as f64,
                radius: b.radius as f64,
            };
            if !sweep_circle_polygon(&circle_b, vertices_a, -velocity_x, -velocity_y, out) {
                return false;
            }
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
            return true;
        }
        (Some(vertices_a), Some(vertices_b)) => {
            return sweep_polygon_polygon(
                vertices_a,
                vertices_b,
                velocity_x,
                velocity_y,
                max_fraction,
                out,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn sweep_polygon_axes(
    axes: &[f32],
    vertices_a: &[f32],
    vertices_b: &[f32],
    velocity_x: f32,
    velocity_y: f32,
    entry_out: &mut f32,
    exit_out: &mut f32,
    normal_out_x: &mut f32,
    normal_out_y: &mut f32,
) -> bool {
    let count = axes.len() / 2;
    for i in 0..count {
        let next = (i + 1) % count;
        let edge_x = axes[next * 2] - axes[i * 2];
        let edge_y = axes[next * 2 + 1] - axes[i * 2 + 1];
        let length = (edge_x * edge_x + edge_y * edge_y).sqrt();
        if !(length > 0.0) {
            continue;
        }
        let axis_x = -edge_y / length;
        let axis_y = edge_x / length;
        let (min_a, max_a) = project_vertices(vertices_a, axis_x, axis_y);
        let (min_b, max_b) = project_vertices(vertices_b, axis_x, axis_y);
        let speed = velocity_x * axis_x + velocity_y * axis_y;
        if speed == 0.0 {
            if max_a < min_b || max_b < min_a {
                return false;
            }
            continue;
        }
        let mut entry = (min_b - max_a) / speed;
        let mut exit = (max_b - min_a) / speed;
        let mut normal_x = -axis_x;
        let mut normal_y = -axis_y;
        if entry > exit {
            let swap = entry;
            entry = exit;
            exit = swap;
            normal_x = axis_x;
            normal_y = axis_y;
        }
        if entry > *entry_out {
            *entry_out = entry;
            *normal_out_x = normal_x;
            *normal_out_y = normal_y;
        }
        if exit < *exit_out {
            *exit_out = exit;
        }
        if *entry_out > *exit_out {
            return false;
        }
    }
    return true;
}

fn sweep_polygon_polygon(
    vertices_a: &[f32],
    vertices_b: &[f32],
    velocity_x: f32,
    velocity_y: f32,
    max_fraction: f32,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    let mut entry = f32::NEG_INFINITY;
    let mut exit = max_fraction;
    let mut normal_x = 0.0_f32;
    let mut normal_y = 0.0_f32;
    if !sweep_polygon_axes(
        vertices_a,
        vertices_a,
        vertices_b,
        velocity_x,
        velocity_y,
        &mut entry,
        &mut exit,
        &mut normal_x,
        &mut normal_y,
    ) {
        return false;
    }
    if !sweep_polygon_axes(
        vertices_b,
        vertices_a,
        vertices_b,
        velocity_x,
        velocity_y,
        &mut entry,
        &mut exit,
        &mut normal_x,
        &mut normal_y,
    ) {
        return false;
    }
    if entry < 0.0 || entry > exit || entry > max_fraction {
        return false;
    }
    out.fraction = entry;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    return true;
}

fn write_capsule_pieces(shape: &CollisionShape2D) -> Vec<SweepPiece> {
    if let CollisionShape2D::Capsule(capsule) = shape {
        // handled below
        return write_capsule_shape_pieces(capsule);
    }
    if let CollisionShape2D::Circle(circle) = shape {
        return vec![SweepPiece {
            x: circle.x as f32,
            y: circle.y as f32,
            radius: circle.radius as f32,
            vertices: None,
        }];
    }
    let Some(vertices) = write_shape_vertices(shape) else {
        return Vec::new();
    };
    return vec![SweepPiece {
        x: 0.0,
        y: 0.0,
        radius: 0.0,
        vertices: Some(vertices),
    }];
}

fn write_capsule_shape_pieces(capsule: &CollisionCapsule2D) -> Vec<SweepPiece> {
    let mut pieces = vec![SweepPiece {
        x: capsule.x0,
        y: capsule.y0,
        radius: capsule.radius,
        vertices: None,
    }];
    let axis_x = capsule.x1 - capsule.x0;
    let axis_y = capsule.y1 - capsule.y0;
    let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
    if length <= SWEEP_EPSILON {
        return pieces;
    }
    pieces.push(SweepPiece {
        x: capsule.x1,
        y: capsule.y1,
        radius: capsule.radius,
        vertices: None,
    });
    let offset_x = (-axis_y / length) * capsule.radius;
    let offset_y = (axis_x / length) * capsule.radius;
    pieces.push(SweepPiece {
        x: 0.0,
        y: 0.0,
        radius: 0.0,
        vertices: Some(vec![
            capsule.x0 + offset_x,
            capsule.y0 + offset_y,
            capsule.x1 + offset_x,
            capsule.y1 + offset_y,
            capsule.x1 - offset_x,
            capsule.y1 - offset_y,
            capsule.x0 - offset_x,
            capsule.y0 - offset_y,
        ]),
    });
    return pieces;
}

fn write_shape_a_support(
    shape: &CollisionShape2D,
    translation_x: f32,
    translation_y: f32,
    out: &mut CollisionTimeOfImpact2D,
) {
    if let CollisionShape2D::Circle(circle) = shape {
        out.x = circle.x as f32 + translation_x - out.normal_x * circle.radius as f32;
        out.y = circle.y as f32 + translation_y - out.normal_y * circle.radius as f32;
        return;
    }
    if let CollisionShape2D::Capsule(capsule) = shape {
        let projection_0 = capsule.x0 * out.normal_x + capsule.y0 * out.normal_y;
        let projection_1 = capsule.x1 * out.normal_x + capsule.y1 * out.normal_y;
        let (axis_x, axis_y) = if projection_0 <= projection_1 {
            (capsule.x0, capsule.y0)
        } else {
            (capsule.x1, capsule.y1)
        };
        out.x = axis_x + translation_x - out.normal_x * capsule.radius;
        out.y = axis_y + translation_y - out.normal_y * capsule.radius;
        return;
    }
    let Some(vertices) = write_shape_vertices(shape) else {
        return;
    };
    let mut best = f32::NEG_INFINITY;
    let mut i = 0;
    while i < vertices.len() {
        let projection = -out.normal_x * vertices[i] - out.normal_y * vertices[i + 1];
        if projection > best {
            best = projection;
        }
        i += 2;
    }
    // A face has two equally extreme vertices; averaging the tied support feature turns a face
    // impact into its midpoint instead of an arbitrary corner (a fictitious lever arm).
    let epsilon = 1e-9 * if best.abs() > 1.0 { best.abs() } else { 1.0 };
    let mut count = 0_u32;
    let mut x = 0.0_f32;
    let mut y = 0.0_f32;
    let mut index = 0;
    while index < vertices.len() {
        let projection = -out.normal_x * vertices[index] - out.normal_y * vertices[index + 1];
        if (projection - best).abs() > epsilon {
            index += 2;
            continue;
        }
        x += vertices[index];
        y += vertices[index + 1];
        count += 1;
        index += 2;
    }
    if count > 0 {
        out.x = x / count as f32 + translation_x;
        out.y = y / count as f32 + translation_y;
    }
}

fn write_shape_vertices(shape: &CollisionShape2D) -> Option<Vec<f32>> {
    match shape {
        CollisionShape2D::Aabb(aabb) => {
            let mut out = [0.0_f32; 8];
            write_aabb_vertices(aabb, &mut out);
            return Some(out.to_vec());
        }
        CollisionShape2D::Obb(obb) => {
            let mut out = [0.0_f32; 8];
            write_obb_vertices(obb, &mut out);
            return Some(out.to_vec());
        }
        CollisionShape2D::Polygon(polygon) => {
            return Some(polygon.points.iter().map(|value| *value as f32).collect());
        }
        _ => return None,
    }
}
