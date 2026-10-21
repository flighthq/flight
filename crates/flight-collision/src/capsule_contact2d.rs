use crate::contact_feature_id::*;
use crate::contact_manifold2d::*;
use crate::convex_vertices2d::*;
use crate::types::*;

const EPSILON: f32 = 1e-9;
const CONTACT_SPAN_EPSILON: f32 = 1e-6;
const PARALLEL_EPSILON: f32 = 1e-3;
const SOURCE_POLYGON_FACE: u8 = 0;
const SOURCE_CAPSULE_SIDE: u8 = 1;
const SOURCE_VERTEX: u8 = 2;

fn capsule_capsule_separation(
    a: &CollisionCapsule2D,
    b: &CollisionCapsule2D,
    normal_x: f32,
    normal_y: f32,
) -> f32 {
    let minimum_a =
        (a.x0 * normal_x + a.y0 * normal_y).min(a.x1 * normal_x + a.y1 * normal_y) - a.radius;
    let maximum_b =
        (b.x0 * normal_x + b.y0 * normal_y).max(b.x1 * normal_x + b.y1 * normal_y) + b.radius;
    return minimum_a - maximum_b;
}

fn capsule_polygon_contact(
    a: &CollisionCapsule2D,
    vertices: &[f32],
    count: usize,
    out: &mut CollisionContactManifold2D,
) -> bool {
    if count < 3 || !(a.radius > 0.0) {
        clear_collision_contact_manifold2d(out);
        return false;
    }

    let mut best_separation = f32::NEG_INFINITY;
    let mut best_normal_x = 0.0_f32;
    let mut best_normal_y = 0.0_f32;
    let mut best_face: i64 = -1;
    let mut best_source = SOURCE_VERTEX;
    let mut best_index: i64 = 0;

    for face in 0..count {
        let next = (face + 1) % count;
        let x0 = vertices[face * 2];
        let y0 = vertices[face * 2 + 1];
        let edge_x = vertices[next * 2] - x0;
        let edge_y = vertices[next * 2 + 1] - y0;
        let length = (edge_x * edge_x + edge_y * edge_y).sqrt();
        if length <= EPSILON {
            continue;
        }
        let mut normal_x = edge_y / length;
        let mut normal_y = -edge_x / length;
        if !is_outward_from_polygon(vertices, count, x0, y0, normal_x, normal_y) {
            normal_x = -normal_x;
            normal_y = -normal_y;
        }
        let separation = capsule_separation(a, vertices, count, normal_x, normal_y);
        if separation > best_separation {
            best_separation = separation;
            best_normal_x = normal_x;
            best_normal_y = normal_y;
            best_face = face as i64;
            best_source = SOURCE_POLYGON_FACE;
            best_index = face as i64;
        }
    }

    let (perp_x, perp_y) = write_perpendicular(a.x1 - a.x0, a.y1 - a.y0);
    let side_candidates = [(perp_x, perp_y), (-perp_x, -perp_y)];
    for (side, &(normal_x, normal_y)) in side_candidates.iter().enumerate() {
        let separation = capsule_separation(a, vertices, count, normal_x, normal_y);
        if separation > best_separation {
            best_separation = separation;
            best_normal_x = normal_x;
            best_normal_y = normal_y;
            best_face = -1;
            best_source = SOURCE_CAPSULE_SIDE;
            best_index = side as i64;
        }
    }

    for vertex in 0..count {
        let vx = vertices[vertex * 2];
        let vy = vertices[vertex * 2 + 1];
        let (closest_x, closest_y) = write_closest_point_on_segment(a.x0, a.y0, a.x1, a.y1, vx, vy);
        let dx = closest_x - vx;
        let dy = closest_y - vy;
        let length = (dx * dx + dy * dy).sqrt();
        if length <= EPSILON {
            continue;
        }
        let normal_x = dx / length;
        let normal_y = dy / length;
        let separation = capsule_separation(a, vertices, count, normal_x, normal_y);
        if separation > best_separation {
            best_separation = separation;
            best_normal_x = normal_x;
            best_normal_y = normal_y;
            best_face = -1;
            best_source = SOURCE_VERTEX;
            best_index = vertex as i64;
        }
    }

    if best_separation >= 0.0 || best_separation == f32::NEG_INFINITY {
        return false;
    }
    let depth = -best_separation;

    if best_source == SOURCE_POLYGON_FACE {
        if let Some(span) = write_face_span(
            a,
            vertices,
            count,
            best_face as usize,
            best_normal_x,
            best_normal_y,
        ) {
            out.overlapping = true;
            out.normal_x = best_normal_x;
            out.normal_y = best_normal_y;
            out.depth = depth;
            out.points[0].x = span.0 - best_normal_x * a.radius;
            out.points[0].y = span.1 - best_normal_y * a.radius;
            out.points[0].depth = span.4;
            out.points[0].feature_id = pack_contact_feature_id(false, best_face, 0, false);
            out.points[1].x = span.2 - best_normal_x * a.radius;
            out.points[1].y = span.3 - best_normal_y * a.radius;
            out.points[1].depth = span.5;
            out.points[1].feature_id = pack_contact_feature_id(false, best_face, 0, true);
            out.point_count = 2;
            return true;
        }
    }

    let (closest_x, closest_y) = write_deepest_axis_point(
        a,
        best_normal_x,
        best_normal_y,
        vertices,
        count,
        best_source,
        best_index,
    );
    let feature_id =
        pack_contact_feature_id(best_source == SOURCE_CAPSULE_SIDE, best_index, 0, false);
    return write_single_capsule_point(
        closest_x,
        closest_y,
        a.radius,
        best_normal_x,
        best_normal_y,
        depth,
        feature_id,
        out,
    );
}

fn capsule_separation(
    a: &CollisionCapsule2D,
    vertices: &[f32],
    count: usize,
    normal_x: f32,
    normal_y: f32,
) -> f32 {
    let axis_minimum =
        (a.x0 * normal_x + a.y0 * normal_y).min(a.x1 * normal_x + a.y1 * normal_y) - a.radius;
    let mut polygon_maximum = f32::NEG_INFINITY;
    for vertex in 0..count {
        let projection = vertices[vertex * 2] * normal_x + vertices[vertex * 2 + 1] * normal_y;
        if projection > polygon_maximum {
            polygon_maximum = projection;
        }
    }
    return axis_minimum - polygon_maximum;
}

fn clamp01(value: f32) -> f32 {
    if value < 0.0 {
        return 0.0;
    }
    if value > 1.0 {
        return 1.0;
    }
    return value;
}

pub(crate) fn collide_capsule_aabb(
    capsule: &CollisionCapsule2D,
    aabb: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut vertices = [0.0_f32; 8];
    write_aabb_vertices(aabb, &mut vertices);
    return capsule_polygon_contact(capsule, &vertices, 4, out);
}

pub fn collide_capsule_aabb_contact_manifold2d(
    a: &CollisionCapsule2D,
    b: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_capsule_aabb(a, b, out);
}

pub(crate) fn collide_capsule_capsule(
    a: &CollisionCapsule2D,
    b: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    if !(a.radius > 0.0) || !(b.radius > 0.0) {
        return false;
    }

    let mut best_separation = f32::NEG_INFINITY;
    let mut best_normal_x = 0.0_f32;
    let mut best_normal_y = 0.0_f32;

    let (perp_ax, perp_ay) = write_perpendicular(a.x1 - a.x0, a.y1 - a.y0);
    let (perp_bx, perp_by) = write_perpendicular(b.x1 - b.x0, b.y1 - b.y0);
    let candidates = [
        (perp_ax, perp_ay),
        (-perp_ax, -perp_ay),
        (perp_bx, perp_by),
        (-perp_bx, -perp_by),
    ];
    for &(normal_x, normal_y) in &candidates {
        let separation = capsule_capsule_separation(a, b, normal_x, normal_y);
        if separation > best_separation {
            best_separation = separation;
            best_normal_x = normal_x;
            best_normal_y = normal_y;
        }
    }

    let endpoints_a = [(a.x0, a.y0), (a.x1, a.y1)];
    let endpoints_b = [(b.x0, b.y0), (b.x1, b.y1)];
    for &(ax, ay) in &endpoints_a {
        for &(bx, by) in &endpoints_b {
            let dx = ax - bx;
            let dy = ay - by;
            let length = (dx * dx + dy * dy).sqrt();
            if length <= EPSILON {
                continue;
            }
            let separation = capsule_capsule_separation(a, b, dx / length, dy / length);
            if separation > best_separation {
                best_separation = separation;
                best_normal_x = dx / length;
                best_normal_y = dy / length;
            }
        }
    }

    if best_separation >= 0.0 || best_separation == f32::NEG_INFINITY {
        return false;
    }
    let depth = -best_separation;

    if let Some((span_x0, span_y0, span_x1, span_y1)) =
        write_parallel_axis_overlap(a, b, best_normal_x, best_normal_y)
    {
        out.overlapping = true;
        out.normal_x = best_normal_x;
        out.normal_y = best_normal_y;
        out.depth = depth;
        let spans = [(span_x0, span_y0), (span_x1, span_y1)];
        for (at, &(x, y)) in spans.iter().enumerate() {
            out.points[at].x = x - best_normal_x * a.radius;
            out.points[at].y = y - best_normal_y * a.radius;
            out.points[at].depth = depth;
            out.points[at].feature_id = pack_contact_feature_id(true, 0, 0, at == 1);
        }
        out.point_count = 2;
        return true;
    }

    let axis_length = ((a.x1 - a.x0) * (a.x1 - a.x0) + (a.y1 - a.y0) * (a.y1 - a.y0)).sqrt();
    let along_axis = if axis_length > EPSILON {
        ((a.x1 - a.x0) * best_normal_x + (a.y1 - a.y0) * best_normal_y) / axis_length
    } else {
        0.0
    };
    let (closest_x, closest_y) = if along_axis.abs() <= PARALLEL_EPSILON {
        let (ax, ay, _, _) =
            write_closest_points_between_segments(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1);
        (ax, ay)
    } else if a.x0 * best_normal_x + a.y0 * best_normal_y
        <= a.x1 * best_normal_x + a.y1 * best_normal_y
    {
        (a.x0, a.y0)
    } else {
        (a.x1, a.y1)
    };
    return write_single_capsule_point(
        closest_x,
        closest_y,
        a.radius,
        best_normal_x,
        best_normal_y,
        depth,
        0,
        out,
    );
}

pub fn collide_capsule_capsule_contact_manifold2d(
    a: &CollisionCapsule2D,
    b: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_capsule_capsule(a, b, out);
}

pub(crate) fn collide_capsule_obb(
    capsule: &CollisionCapsule2D,
    obb: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut vertices = [0.0_f32; 8];
    write_obb_vertices(obb, &mut vertices);
    return capsule_polygon_contact(capsule, &vertices, 4, out);
}

pub fn collide_capsule_obb_contact_manifold2d(
    a: &CollisionCapsule2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_capsule_obb(a, b, out);
}

pub(crate) fn collide_capsule_polygon(
    capsule: &CollisionCapsule2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let vertices = polygon_vertices_f32(poly);
    let count = vertices.len() / 2;
    return capsule_polygon_contact(capsule, &vertices, count, out);
}

pub fn collide_capsule_polygon_contact_manifold2d(
    a: &CollisionCapsule2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_capsule_polygon(a, b, out);
}

pub(crate) fn collide_circle_capsule(
    circle: &CollisionCircle2D,
    capsule: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let circle_x = circle.x as f32;
    let circle_y = circle.y as f32;
    let circle_radius = circle.radius as f32;
    let (closest_x, closest_y) = write_closest_point_on_segment(
        capsule.x0, capsule.y0, capsule.x1, capsule.y1, circle_x, circle_y,
    );
    let mut normal_x = circle_x - closest_x;
    let mut normal_y = circle_y - closest_y;
    let distance = (normal_x * normal_x + normal_y * normal_y).sqrt();
    let sum = circle_radius + capsule.radius;
    if distance >= sum {
        return false;
    }
    if distance > EPSILON {
        normal_x /= distance;
        normal_y /= distance;
    } else {
        let (perp_x, perp_y) =
            write_perpendicular(capsule.x1 - capsule.x0, capsule.y1 - capsule.y0);
        normal_x = perp_x;
        normal_y = perp_y;
    }
    return write_single_capsule_point(
        circle_x,
        circle_y,
        circle_radius,
        normal_x,
        normal_y,
        sum - distance,
        0,
        out,
    );
}

pub fn collide_circle_capsule_contact_manifold2d(
    a: &CollisionCircle2D,
    b: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_circle_capsule(a, b, out);
}

fn is_outward_from_polygon(
    vertices: &[f32],
    count: usize,
    x: f32,
    y: f32,
    normal_x: f32,
    normal_y: f32,
) -> bool {
    for vertex in 0..count {
        let projection =
            (vertices[vertex * 2] - x) * normal_x + (vertices[vertex * 2 + 1] - y) * normal_y;
        if projection > EPSILON {
            return false;
        }
    }
    return true;
}

fn polygon_vertices_f32(poly: &CollisionPolygon2D) -> Vec<f32> {
    return poly.points.iter().map(|value| *value as f32).collect();
}

fn write_closest_point_on_segment(
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    px: f32,
    py: f32,
) -> (f32, f32) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0_f32;
    if length_squared > 0.0 {
        t = ((px - x0) * dx + (py - y0) * dy) / length_squared;
        t = if t < 0.0 {
            0.0
        } else if t > 1.0 {
            1.0
        } else {
            t
        };
    }
    return (x0 + t * dx, y0 + t * dy);
}

fn write_closest_points_between_segments(
    ax0: f32,
    ay0: f32,
    ax1: f32,
    ay1: f32,
    bx0: f32,
    by0: f32,
    bx1: f32,
    by1: f32,
) -> (f32, f32, f32, f32) {
    let dax = ax1 - ax0;
    let day = ay1 - ay0;
    let dbx = bx1 - bx0;
    let dby = by1 - by0;
    let rx = ax0 - bx0;
    let ry = ay0 - by0;
    let aa = dax * dax + day * day;
    let bb = dbx * dbx + dby * dby;
    let f = dbx * rx + dby * ry;

    let mut s = 0.0_f32;
    let mut t = 0.0_f32;
    if aa <= EPSILON && bb <= EPSILON {
        s = 0.0;
        t = 0.0;
    } else if aa <= EPSILON {
        t = clamp01(f / bb);
    } else {
        let c = dax * rx + day * ry;
        if bb <= EPSILON {
            s = clamp01(-c / aa);
        } else {
            let b = dax * dbx + day * dby;
            let denominator = aa * bb - b * b;
            s = if denominator > EPSILON {
                clamp01((b * f - c * bb) / denominator)
            } else {
                0.0
            };
            t = (b * s + f) / bb;
            if t < 0.0 {
                t = 0.0;
                s = clamp01(-c / aa);
            } else if t > 1.0 {
                t = 1.0;
                s = clamp01((b - c) / aa);
            }
        }
    }
    return (ax0 + dax * s, ay0 + day * s, bx0 + dbx * t, by0 + dby * t);
}

fn write_deepest_axis_point(
    a: &CollisionCapsule2D,
    normal_x: f32,
    normal_y: f32,
    vertices: &[f32],
    count: usize,
    source: u8,
    index: i64,
) -> (f32, f32) {
    if source == SOURCE_VERTEX {
        return write_closest_point_on_segment(
            a.x0,
            a.y0,
            a.x1,
            a.y1,
            vertices[index as usize * 2],
            vertices[index as usize * 2 + 1],
        );
    }
    let projection_0 = a.x0 * normal_x + a.y0 * normal_y;
    let projection_1 = a.x1 * normal_x + a.y1 * normal_y;
    if source == SOURCE_CAPSULE_SIDE {
        let mut deepest = 0_usize;
        let mut deepest_projection = f32::NEG_INFINITY;
        for vertex in 0..count {
            let value = vertices[vertex * 2] * normal_x + vertices[vertex * 2 + 1] * normal_y;
            if value > deepest_projection {
                deepest_projection = value;
                deepest = vertex;
            }
        }
        return write_closest_point_on_segment(
            a.x0,
            a.y0,
            a.x1,
            a.y1,
            vertices[deepest * 2],
            vertices[deepest * 2 + 1],
        );
    }
    if projection_0 <= projection_1 {
        return (a.x0, a.y0);
    }
    return (a.x1, a.y1);
}

fn write_face_span(
    a: &CollisionCapsule2D,
    vertices: &[f32],
    count: usize,
    face: usize,
    normal_x: f32,
    normal_y: f32,
) -> Option<(f32, f32, f32, f32, f32, f32)> {
    let axis_x = a.x1 - a.x0;
    let axis_y = a.y1 - a.y0;
    let axis_length = (axis_x * axis_x + axis_y * axis_y).sqrt();
    if axis_length <= EPSILON {
        return None;
    }
    if ((axis_x / axis_length) * normal_x + (axis_y / axis_length) * normal_y).abs()
        > PARALLEL_EPSILON
    {
        return None;
    }

    let next = (face + 1) % count;
    let face_x0 = vertices[face * 2];
    let face_y0 = vertices[face * 2 + 1];
    let face_x1 = vertices[next * 2];
    let face_y1 = vertices[next * 2 + 1];
    let tangent_x = face_x1 - face_x0;
    let tangent_y = face_y1 - face_y0;
    let face_length = (tangent_x * tangent_x + tangent_y * tangent_y).sqrt();
    if face_length <= EPSILON {
        return None;
    }
    let unit_x = tangent_x / face_length;
    let unit_y = tangent_y / face_length;

    let start = (a.x0 - face_x0) * unit_x + (a.y0 - face_y0) * unit_y;
    let end = (a.x1 - face_x0) * unit_x + (a.y1 - face_y0) * unit_y;
    let low = start.min(end).max(0.0);
    let high = start.max(end).min(face_length);
    if high - low <= CONTACT_SPAN_EPSILON {
        return None;
    }

    let mut span = [0.0_f32; 6];
    for at in 0..2 {
        let along = if at == 0 { low } else { high };
        let fraction = (along - start) / (end - start);
        let x = a.x0 + (a.x1 - a.x0) * fraction;
        let y = a.y0 + (a.y1 - a.y0) * fraction;
        span[at * 2] = x;
        span[at * 2 + 1] = y;
        span[4 + at] = a.radius - ((x - face_x0) * normal_x + (y - face_y0) * normal_y);
    }
    if !(span[4] > 0.0) || !(span[5] > 0.0) {
        return None;
    }
    return Some((span[0], span[1], span[2], span[3], span[4], span[5]));
}

fn write_parallel_axis_overlap(
    a: &CollisionCapsule2D,
    b: &CollisionCapsule2D,
    normal_x: f32,
    normal_y: f32,
) -> Option<(f32, f32, f32, f32)> {
    let axis_ax = a.x1 - a.x0;
    let axis_ay = a.y1 - a.y0;
    let length_a = (axis_ax * axis_ax + axis_ay * axis_ay).sqrt();
    let length_b = ((b.x1 - b.x0) * (b.x1 - b.x0) + (b.y1 - b.y0) * (b.y1 - b.y0)).sqrt();
    if length_a <= EPSILON || length_b <= EPSILON {
        return None;
    }
    let unit_x = axis_ax / length_a;
    let unit_y = axis_ay / length_a;
    if (unit_x * normal_x + unit_y * normal_y).abs() > PARALLEL_EPSILON {
        return None;
    }
    let unit_bx = (b.x1 - b.x0) / length_b;
    let unit_by = (b.y1 - b.y0) / length_b;
    if (unit_bx * normal_x + unit_by * normal_y).abs() > PARALLEL_EPSILON {
        return None;
    }
    let start_b = (b.x0 - a.x0) * unit_x + (b.y0 - a.y0) * unit_y;
    let end_b = (b.x1 - a.x0) * unit_x + (b.y1 - a.y0) * unit_y;
    let low = (start_b.min(end_b)).max(0.0);
    let high = (start_b.max(end_b)).min(length_a);
    let overlap = high - low;
    if overlap <= CONTACT_SPAN_EPSILON {
        return None;
    }
    return Some((
        a.x0 + unit_x * low,
        a.y0 + unit_y * low,
        a.x0 + unit_x * high,
        a.y0 + unit_y * high,
    ));
}

fn write_perpendicular(dx: f32, dy: f32) -> (f32, f32) {
    let length = (dx * dx + dy * dy).sqrt();
    if length <= EPSILON {
        return (1.0, 0.0);
    }
    return (-dy / length, dx / length);
}

fn write_single_capsule_point(
    axis_x: f32,
    axis_y: f32,
    radius: f32,
    normal_x: f32,
    normal_y: f32,
    depth: f32,
    feature_id: i64,
    out: &mut CollisionContactManifold2D,
) -> bool {
    out.overlapping = true;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.depth = depth;
    out.points[0].x = axis_x - normal_x * radius;
    out.points[0].y = axis_y - normal_y * radius;
    out.points[0].depth = depth;
    out.points[0].feature_id = feature_id;
    out.point_count = 1;
    return true;
}
