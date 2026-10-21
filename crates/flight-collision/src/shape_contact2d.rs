use crate::contact_feature_id::*;
use crate::contact_manifold2d::*;
use crate::convex_vertices2d::*;
use crate::types::*;

const EPS: f32 = 1e-9;
const REFERENCE_BIAS: f32 = 1e-6;

/// Appends the clipped incident point at parameter `s` when it lies behind the reference face.
fn append_clipped_contact(
    p0_x: f32,
    p0_y: f32,
    p1_x: f32,
    p1_y: f32,
    s: f32,
    face_x: f32,
    face_y: f32,
    normal_x: f32,
    normal_y: f32,
    feature_id: i64,
    out: &mut CollisionContactManifold2D,
) {
    let x = p0_x + (p1_x - p0_x) * s;
    let y = p0_y + (p1_y - p0_y) * s;
    let separation = normal_x * (x - face_x) + normal_y * (y - face_y);
    if separation > 0.0 {
        return;
    }
    let index = out.point_count;
    if index >= MAX_COLLISION_CONTACT_POINTS_2D {
        return;
    }
    out.points[index].x = x;
    out.points[index].y = y;
    out.points[index].depth = -separation;
    out.points[index].feature_id = feature_id;
    out.point_count = index + 1;
}

fn clamp(v: f32, min: f32, max: f32) -> f32 {
    if v < min {
        min
    } else if v > max {
        max
    } else {
        v
    }
}

fn clip_against_plane(
    nx: f32,
    ny: f32,
    offset: f32,
    points: &mut [(f32, f32); 2],
    count: usize,
) -> usize {
    if count < 2 {
        return count;
    }
    let d0 = nx * points[0].0 + ny * points[0].1 - offset;
    let d1 = nx * points[1].0 + ny * points[1].1 - offset;

    if d0 <= 0.0 && d1 <= 0.0 {
        return count; // both inside
    }
    if d0 > 0.0 && d1 > 0.0 {
        return 0; // both outside
    }
    // One inside, one outside - clip
    let t = d0 / (d0 - d1);
    let clip_x = points[0].0 + (points[1].0 - points[0].0) * t;
    let clip_y = points[0].1 + (points[1].1 - points[0].1) * t;
    if d0 > 0.0 {
        points[0] = (clip_x, clip_y);
    } else {
        points[1] = (clip_x, clip_y);
    }
    return 2;
}

fn closest_point_on_segment(sx: f32, sy: f32, ex: f32, ey: f32, px: f32, py: f32) -> (f32, f32) {
    let dx = ex - sx;
    let dy = ey - sy;
    let len_sq = dx * dx + dy * dy;
    if len_sq <= 0.0 {
        return (sx, sy);
    }
    let mut t = ((px - sx) * dx + (py - sy) * dy) / len_sq;
    if t < 0.0 {
        t = 0.0;
    }
    if t > 1.0 {
        t = 1.0;
    }
    return (sx + dx * t, sy + dy * t);
}

pub(crate) fn collide_aabb_aabb_contact(
    a: &CollisionAabb2D,
    b: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut verts_a = [0.0_f32; 8];
    let mut verts_b = [0.0_f32; 8];
    write_aabb_vertices(a, &mut verts_a);
    write_aabb_vertices(b, &mut verts_b);
    return convex_contact(&verts_a, 4, &verts_b, 4, out);
}

pub fn collide_aabb_aabb_contact_manifold2d(
    a: &CollisionAabb2D,
    b: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_aabb_aabb_contact(a, b, out);
}

pub(crate) fn collide_aabb_obb_contact(
    aabb: &CollisionAabb2D,
    obb: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut verts_a = [0.0_f32; 8];
    let mut verts_b = [0.0_f32; 8];
    write_aabb_vertices(aabb, &mut verts_a);
    write_obb_vertices(obb, &mut verts_b);
    return convex_contact(&verts_a, 4, &verts_b, 4, out);
}

pub fn collide_aabb_obb_contact_manifold2d(
    a: &CollisionAabb2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_aabb_obb_contact(a, b, out);
}

pub(crate) fn collide_aabb_polygon_contact(
    aabb: &CollisionAabb2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut verts_a = [0.0_f32; 8];
    write_aabb_vertices(aabb, &mut verts_a);
    let verts_b = polygon_vertices(poly);
    let count_b = verts_b.len() / 2;
    return convex_contact(&verts_a, 4, &verts_b, count_b, out);
}

pub fn collide_aabb_polygon_contact_manifold2d(
    a: &CollisionAabb2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_aabb_polygon_contact(a, b, out);
}

pub(crate) fn collide_circle_aabb_contact(
    circle: &CollisionCircle2D,
    aabb: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let circle_x = circle.x as f32;
    let circle_y = circle.y as f32;
    let circle_radius = circle.radius as f32;
    let cx = clamp(circle_x, aabb.min_x, aabb.max_x);
    let cy = clamp(circle_y, aabb.min_y, aabb.max_y);
    let dx = circle_x - cx;
    let dy = circle_y - cy;
    let dist_sq = dx * dx + dy * dy;
    if dist_sq > EPS * EPS {
        let dist = dist_sq.sqrt();
        if dist >= circle_radius {
            return false;
        }
        out.normal_x = dx / dist;
        out.normal_y = dy / dist;
        out.depth = circle_radius - dist;
    } else {
        // Center inside AABB
        let faces = [
            (circle_x - aabb.min_x, -1.0, 0.0),
            (aabb.max_x - circle_x, 1.0, 0.0),
            (circle_y - aabb.min_y, 0.0, -1.0),
            (aabb.max_y - circle_y, 0.0, 1.0),
        ];
        let mut min_d = f32::INFINITY;
        for &(d, nx, ny) in &faces {
            if d < min_d {
                min_d = d;
                out.normal_x = nx;
                out.normal_y = ny;
            }
        }
        out.depth = min_d + circle_radius;
    }
    out.overlapping = true;
    write_circle_contact(circle, out);
    return true;
}

pub fn collide_circle_aabb_contact_manifold2d(
    a: &CollisionCircle2D,
    b: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_circle_aabb_contact(a, b, out);
}

pub(crate) fn collide_circle_circle_contact(
    a: &CollisionCircle2D,
    b: &CollisionCircle2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let dx = a.x as f32 - b.x as f32;
    let dy = a.y as f32 - b.y as f32;
    let radius_sum = a.radius as f32 + b.radius as f32;
    let dist_sq = dx * dx + dy * dy;
    if dist_sq >= radius_sum * radius_sum {
        return false;
    }
    let dist = dist_sq.sqrt();
    if dist > EPS {
        let inv = 1.0 / dist;
        out.normal_x = dx * inv;
        out.normal_y = dy * inv;
        out.depth = radius_sum - dist;
    } else {
        out.normal_x = 1.0;
        out.normal_y = 0.0;
        out.depth = radius_sum;
    }
    out.overlapping = true;
    write_circle_contact(a, out);
    return true;
}

pub fn collide_circle_circle_contact_manifold2d(
    a: &CollisionCircle2D,
    b: &CollisionCircle2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_circle_circle_contact(a, b, out);
}

pub(crate) fn collide_circle_obb_contact(
    circle: &CollisionCircle2D,
    obb: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let circle_x = circle.x as f32;
    let circle_y = circle.y as f32;
    let circle_radius = circle.radius as f32;
    let cos = obb.rotation.cos();
    let sin = obb.rotation.sin();
    let rdx = circle_x - obb.x;
    let rdy = circle_y - obb.y;
    let local_x = rdx * cos + rdy * sin;
    let local_y = -rdx * sin + rdy * cos;

    let cx = clamp(local_x, -obb.half_w, obb.half_w);
    let cy = clamp(local_y, -obb.half_h, obb.half_h);
    let dx = local_x - cx;
    let dy = local_y - cy;
    let dist_sq = dx * dx + dy * dy;

    if dist_sq > EPS * EPS {
        let dist = dist_sq.sqrt();
        if dist >= circle_radius {
            return false;
        }
        let lnx = dx / dist;
        let lny = dy / dist;
        out.normal_x = lnx * cos - lny * sin;
        out.normal_y = lnx * sin + lny * cos;
        out.depth = circle_radius - dist;
    } else {
        let faces = [
            (local_x + obb.half_w, -1.0, 0.0),
            (obb.half_w - local_x, 1.0, 0.0),
            (local_y + obb.half_h, 0.0, -1.0),
            (obb.half_h - local_y, 0.0, 1.0),
        ];
        let mut min_d = f32::INFINITY;
        let mut lnx = 1.0_f32;
        let mut lny = 0.0_f32;
        for &(d, nx, ny) in &faces {
            if d < min_d {
                min_d = d;
                lnx = nx;
                lny = ny;
            }
        }
        out.normal_x = lnx * cos - lny * sin;
        out.normal_y = lnx * sin + lny * cos;
        out.depth = min_d + circle_radius;
    }
    out.overlapping = true;
    write_circle_contact(circle, out);
    return true;
}

pub fn collide_circle_obb_contact_manifold2d(
    a: &CollisionCircle2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_circle_obb_contact(a, b, out);
}

pub(crate) fn collide_circle_polygon_contact(
    circle: &CollisionCircle2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let points = polygon_vertices(poly);
    let count = points.len() / 2;
    if count < 3 {
        return false;
    }

    let circle_x = circle.x as f32;
    let circle_y = circle.y as f32;
    let circle_radius = circle.radius as f32;

    let mut min_dist = f32::INFINITY;
    let mut best_nx = 0.0_f32;
    let mut best_ny = 0.0_f32;
    let mut inside = true;

    for i in 0..count {
        let j = (i + 1) % count;
        let ex = points[j * 2] - points[i * 2];
        let ey = points[j * 2 + 1] - points[i * 2 + 1];
        let len = (ex * ex + ey * ey).sqrt();
        if len < EPS {
            continue;
        }
        let nx = ey / len;
        let ny = -ex / len;
        let d = (circle_x - points[i * 2]) * nx + (circle_y - points[i * 2 + 1]) * ny;
        if d > 0.0 {
            inside = false;
        }
        if d < min_dist {
            min_dist = d;
            best_nx = nx;
            best_ny = ny;
        }
    }

    if !inside && min_dist >= circle_radius {
        return false;
    }

    if inside {
        out.normal_x = best_nx;
        out.normal_y = best_ny;
        out.depth = circle_radius - min_dist;
    } else {
        // Find closest point on polygon boundary
        let mut best_d = f32::INFINITY;
        let mut cp_x = 0.0_f32;
        let mut cp_y = 0.0_f32;
        for i in 0..count {
            let j = (i + 1) % count;
            let (px, py) = closest_point_on_segment(
                points[i * 2],
                points[i * 2 + 1],
                points[j * 2],
                points[j * 2 + 1],
                circle_x,
                circle_y,
            );
            let d = (circle_x - px) * (circle_x - px) + (circle_y - py) * (circle_y - py);
            if d < best_d {
                best_d = d;
                cp_x = px;
                cp_y = py;
            }
        }
        let d = best_d.sqrt();
        if d >= circle_radius {
            return false;
        }
        if d > EPS {
            out.normal_x = (circle_x - cp_x) / d;
            out.normal_y = (circle_y - cp_y) / d;
        } else {
            out.normal_x = best_nx;
            out.normal_y = best_ny;
        }
        out.depth = circle_radius - d;
    }

    out.overlapping = true;
    write_circle_contact(circle, out);
    return true;
}

pub fn collide_circle_polygon_contact_manifold2d(
    a: &CollisionCircle2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_circle_polygon_contact(a, b, out);
}

pub(crate) fn collide_obb_obb_contact(
    a: &CollisionObb2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut verts_a = [0.0_f32; 8];
    let mut verts_b = [0.0_f32; 8];
    write_obb_vertices(a, &mut verts_a);
    write_obb_vertices(b, &mut verts_b);
    return convex_contact(&verts_a, 4, &verts_b, 4, out);
}

pub fn collide_obb_obb_contact_manifold2d(
    a: &CollisionObb2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_obb_obb_contact(a, b, out);
}

pub(crate) fn collide_obb_polygon_contact(
    obb: &CollisionObb2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let mut verts_a = [0.0_f32; 8];
    write_obb_vertices(obb, &mut verts_a);
    let verts_b = polygon_vertices(poly);
    let count_b = verts_b.len() / 2;
    return convex_contact(&verts_a, 4, &verts_b, count_b, out);
}

pub fn collide_obb_polygon_contact_manifold2d(
    a: &CollisionObb2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_obb_polygon_contact(a, b, out);
}

pub(crate) fn collide_polygon_polygon_contact(
    a: &CollisionPolygon2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let verts_a = polygon_vertices(a);
    let verts_b = polygon_vertices(b);
    let count_a = verts_a.len() / 2;
    let count_b = verts_b.len() / 2;
    return convex_contact(&verts_a, count_a, &verts_b, count_b, out);
}

pub fn collide_polygon_polygon_contact_manifold2d(
    a: &CollisionPolygon2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    return collide_polygon_polygon_contact(a, b, out);
}

/// Core convex-convex contact generation using reference/incident face clipping (TS
/// `convexContact`). The outward normal of every candidate face is derived from the shape's centroid,
/// so winding does not matter; the reference face is the shallowest-axis face, biased toward A on
/// magnitude-relative near-ties.
fn convex_contact(
    verts_a: &[f32],
    count_a: usize,
    verts_b: &[f32],
    count_b: usize,
    out: &mut CollisionContactManifold2D,
) -> bool {
    let limit = FEATURE_INDEX_LIMIT as usize;
    if count_a < 3 || count_b < 3 || count_a > limit || count_b > limit {
        clear_collision_contact_manifold2d(out);
        return false;
    }

    let (sep_a, edge_a, normal_ax, normal_ay) =
        max_face_separation(verts_a, count_a, verts_b, count_b);
    if sep_a >= 0.0 || !edge_a.is_some() {
        clear_collision_contact_manifold2d(out);
        return false;
    }
    let edge_a = edge_a.unwrap();

    let (sep_b, edge_b, normal_bx, normal_by) =
        max_face_separation(verts_b, count_b, verts_a, count_a);
    if sep_b >= 0.0 || !edge_b.is_some() {
        clear_collision_contact_manifold2d(out);
        return false;
    }
    let edge_b = edge_b.unwrap();

    // Magnitude-relative bias toward A, so a resting pair does not flip its reference shape (and
    // renumber every feature id) on floating-point noise.
    let magnitude = if sep_a.abs() > sep_b.abs() {
        sep_a.abs()
    } else {
        sep_b.abs()
    };
    let reference_is_a = sep_b <= sep_a + REFERENCE_BIAS * magnitude;

    let (reference, reference_count, reference_edge, incident, incident_count) = if reference_is_a {
        (verts_a, count_a, edge_a, verts_b, count_b)
    } else {
        (verts_b, count_b, edge_b, verts_a, count_a)
    };
    let (normal_x, normal_y) = if reference_is_a {
        (normal_ax, normal_ay)
    } else {
        (normal_bx, normal_by)
    };

    let reference_next = (reference_edge + 1) % reference_count;
    let v1_x = reference[reference_edge * 2];
    let v1_y = reference[reference_edge * 2 + 1];
    let v2_x = reference[reference_next * 2];
    let v2_y = reference[reference_next * 2 + 1];

    let incident_edge = most_anti_parallel_edge(incident, incident_count, normal_x, normal_y);
    let incident_next = (incident_edge + 1) % incident_count;
    let p0_x = incident[incident_edge * 2];
    let p0_y = incident[incident_edge * 2 + 1];
    let p1_x = incident[incident_next * 2];
    let p1_y = incident[incident_next * 2 + 1];

    let mut tangent_x = v2_x - v1_x;
    let mut tangent_y = v2_y - v1_y;
    let tangent_length = (tangent_x * tangent_x + tangent_y * tangent_y).sqrt();
    if tangent_length <= EPS {
        clear_collision_contact_manifold2d(out);
        return false;
    }
    tangent_x /= tangent_length;
    tangent_y /= tangent_length;

    let low = tangent_x * v1_x + tangent_y * v1_y;
    let high = tangent_x * v2_x + tangent_y * v2_y;
    let t0 = tangent_x * p0_x + tangent_y * p0_y;
    let t1 = tangent_x * p1_x + tangent_y * p1_y;

    let mut clip_start = 0.0_f32;
    let mut clip_end = 1.0_f32;
    let tangent_span = t1 - t0;
    if tangent_span.abs() > EPS {
        let s_low = (low - t0) / tangent_span;
        let s_high = (high - t0) / tangent_span;
        let s_min = if s_low < s_high { s_low } else { s_high };
        let s_max = if s_low < s_high { s_high } else { s_low };
        if s_min > clip_start {
            clip_start = s_min;
        }
        if s_max < clip_end {
            clip_end = s_max;
        }
    } else if t0 < low - EPS || t0 > high + EPS {
        clip_start = 1.0;
        clip_end = 0.0;
    }

    // The MTV normal is the reference face's outward normal, which points from the reference shape
    // toward the incident one. Pushing A out of B negates it exactly when A is the reference.
    let reference_separation = if reference_is_a { sep_a } else { sep_b };
    out.normal_x = if reference_is_a { -normal_x } else { normal_x };
    out.normal_y = if reference_is_a { -normal_y } else { normal_y };
    out.depth = -reference_separation;
    out.overlapping = true;
    out.point_count = 0;

    if clip_start <= clip_end {
        let first = pack_contact_feature_id(
            reference_is_a,
            reference_edge as i64,
            incident_edge as i64,
            false,
        );
        append_clipped_contact(
            p0_x, p0_y, p1_x, p1_y, clip_start, v1_x, v1_y, normal_x, normal_y, first, out,
        );
        if clip_end > clip_start {
            let second = pack_contact_feature_id(
                reference_is_a,
                reference_edge as i64,
                incident_edge as i64,
                true,
            );
            append_clipped_contact(
                p0_x, p0_y, p1_x, p1_y, clip_end, v1_x, v1_y, normal_x, normal_y, second, out,
            );
        }
    }
    return true;
}

/// Greatest separation of `o` from any face of `s`, with the winning outward normal derived from
/// `s`'s centroid (TS `maxFaceSeparation`). Returns the separation, the winning edge (if any), and
/// that edge's outward normal.
fn max_face_separation(
    sx: &[f32],
    sn: usize,
    ox: &[f32],
    on: usize,
) -> (f32, Option<usize>, f32, f32) {
    let mut centroid_x = 0.0_f32;
    let mut centroid_y = 0.0_f32;
    for i in 0..sn {
        centroid_x += sx[i * 2];
        centroid_y += sx[i * 2 + 1];
    }
    centroid_x /= sn as f32;
    centroid_y /= sn as f32;

    let mut best = f32::NEG_INFINITY;
    let mut best_edge: Option<usize> = None;
    let mut best_normal_x = 0.0_f32;
    let mut best_normal_y = 0.0_f32;
    for i in 0..sn {
        let j = (i + 1) % sn;
        let x0 = sx[i * 2];
        let y0 = sx[i * 2 + 1];
        let mut normal_x = sx[j * 2 + 1] - y0;
        let mut normal_y = x0 - sx[j * 2];
        let length = (normal_x * normal_x + normal_y * normal_y).sqrt();
        if length <= EPS {
            continue;
        }
        normal_x /= length;
        normal_y /= length;
        if normal_x * (x0 - centroid_x) + normal_y * (y0 - centroid_y) < 0.0 {
            normal_x = -normal_x;
            normal_y = -normal_y;
        }

        let mut separation = f32::INFINITY;
        for k in 0..on {
            let projected = normal_x * (ox[k * 2] - x0) + normal_y * (ox[k * 2 + 1] - y0);
            if projected < separation {
                separation = projected;
            }
        }
        if separation > best {
            best = separation;
            best_edge = Some(i);
            best_normal_x = normal_x;
            best_normal_y = normal_y;
        }
    }
    return (best, best_edge, best_normal_x, best_normal_y);
}

/// The face whose centroid-oriented outward normal opposes (`normal_x`,`normal_y`) most directly
/// (TS `mostAntiParallelEdge`).
fn most_anti_parallel_edge(verts: &[f32], count: usize, normal_x: f32, normal_y: f32) -> usize {
    let mut centroid_x = 0.0_f32;
    let mut centroid_y = 0.0_f32;
    for i in 0..count {
        centroid_x += verts[i * 2];
        centroid_y += verts[i * 2 + 1];
    }
    centroid_x /= count as f32;
    centroid_y /= count as f32;

    let mut best = f32::INFINITY;
    let mut best_edge = 0_usize;
    for i in 0..count {
        let j = (i + 1) % count;
        let x0 = verts[i * 2];
        let y0 = verts[i * 2 + 1];
        let mut edge_normal_x = verts[j * 2 + 1] - y0;
        let mut edge_normal_y = x0 - verts[j * 2];
        let length = (edge_normal_x * edge_normal_x + edge_normal_y * edge_normal_y).sqrt();
        if length <= EPS {
            continue;
        }
        edge_normal_x /= length;
        edge_normal_y /= length;
        if edge_normal_x * (x0 - centroid_x) + edge_normal_y * (y0 - centroid_y) < 0.0 {
            edge_normal_x = -edge_normal_x;
            edge_normal_y = -edge_normal_y;
        }
        let alignment = edge_normal_x * normal_x + edge_normal_y * normal_y;
        if alignment < best {
            best = alignment;
            best_edge = i;
        }
    }
    return best_edge;
}

fn polygon_vertices(poly: &CollisionPolygon2D) -> Vec<f32> {
    return poly.points.iter().map(|value| *value as f32).collect();
}

fn write_circle_contact(circle: &CollisionCircle2D, out: &mut CollisionContactManifold2D) {
    out.point_count = 1;
    out.points[0].x = circle.x as f32 - out.normal_x * circle.radius as f32;
    out.points[0].y = circle.y as f32 - out.normal_y * circle.radius as f32;
    out.points[0].depth = out.depth;
    out.points[0].feature_id = 0;
}
