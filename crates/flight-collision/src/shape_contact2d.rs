use crate::contact_feature_id::*;
use crate::contact_manifold2d::*;
use crate::convex_vertices2d::*;
use crate::types::*;

const EPS: f32 = 1e-9;
const REFERENCE_BIAS: f32 = 1e-6;

fn clamp(v: f32, min: f32, max: f32) -> f32 {
    if v < min { min } else if v > max { max } else { v }
}

fn clip_against_plane(
    nx: f32,
    ny: f32,
    offset: f32,
    points: &mut [(f32, f32); 2],
    count: usize,
) -> usize {
    if count < 2 { return count; }
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

fn closest_point_on_segment(
    sx: f32, sy: f32, ex: f32, ey: f32, px: f32, py: f32,
) -> (f32, f32) {
    let dx = ex - sx;
    let dy = ey - sy;
    let len_sq = dx * dx + dy * dy;
    if len_sq <= 0.0 { return (sx, sy); }
    let mut t = ((px - sx) * dx + (py - sy) * dy) / len_sq;
    if t < 0.0 { t = 0.0; }
    if t > 1.0 { t = 1.0; }
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

pub fn collide_aabb_aabb_contact_manifold2d(a: &CollisionAabb2D,
    b: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,) -> bool {
    return collide_aabb_aabb_contact(a, b, out, );
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

pub fn collide_aabb_obb_contact_manifold2d(a: &CollisionAabb2D, b: &CollisionObb2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_aabb_obb_contact(a, b, out, );
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

pub fn collide_aabb_polygon_contact_manifold2d(a: &CollisionAabb2D, b: &CollisionPolygon2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_aabb_polygon_contact(a, b, out, );
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
        if dist >= circle_radius { return false; }
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
            if d < min_d { min_d = d; out.normal_x = nx; out.normal_y = ny; }
        }
        out.depth = min_d + circle_radius;
    }
    out.overlapping = true;
    write_circle_contact(circle, out);
    return true;
}

pub fn collide_circle_aabb_contact_manifold2d(a: &CollisionCircle2D, b: &CollisionAabb2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_circle_aabb_contact(a, b, out, );
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

pub fn collide_circle_circle_contact_manifold2d(a: &CollisionCircle2D,
    b: &CollisionCircle2D,
    out: &mut CollisionContactManifold2D,) -> bool {
    return collide_circle_circle_contact(a, b, out, );
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
        if dist >= circle_radius { return false; }
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
            if d < min_d { min_d = d; lnx = nx; lny = ny; }
        }
        out.normal_x = lnx * cos - lny * sin;
        out.normal_y = lnx * sin + lny * cos;
        out.depth = min_d + circle_radius;
    }
    out.overlapping = true;
    write_circle_contact(circle, out);
    return true;
}

pub fn collide_circle_obb_contact_manifold2d(a: &CollisionCircle2D, b: &CollisionObb2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_circle_obb_contact(a, b, out, );
}


pub(crate) fn collide_circle_polygon_contact(
    circle: &CollisionCircle2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let points = polygon_vertices(poly);
    let count = points.len() / 2;
    if count < 3 { return false; }

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
        if len < EPS { continue; }
        let nx = ey / len;
        let ny = -ex / len;
        let d = (circle_x - points[i * 2]) * nx + (circle_y - points[i * 2 + 1]) * ny;
        if d > 0.0 { inside = false; }
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
                points[i * 2], points[i * 2 + 1],
                points[j * 2], points[j * 2 + 1],
                circle_x, circle_y,
            );
            let d = (circle_x - px) * (circle_x - px) + (circle_y - py) * (circle_y - py);
            if d < best_d { best_d = d; cp_x = px; cp_y = py; }
        }
        let d = best_d.sqrt();
        if d >= circle_radius { return false; }
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

pub fn collide_circle_polygon_contact_manifold2d(a: &CollisionCircle2D, b: &CollisionPolygon2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_circle_polygon_contact(a, b, out, );
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

pub fn collide_obb_obb_contact_manifold2d(a: &CollisionObb2D,
    b: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,) -> bool {
    return collide_obb_obb_contact(a, b, out, );
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

pub fn collide_obb_polygon_contact_manifold2d(a: &CollisionObb2D, b: &CollisionPolygon2D, out: &mut CollisionContactManifold2D, ) -> bool {
    return collide_obb_polygon_contact(a, b, out, );
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

pub fn collide_polygon_polygon_contact_manifold2d(a: &CollisionPolygon2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,) -> bool {
    return collide_polygon_polygon_contact(a, b, out, );
}


/// Core convex-convex contact generation using reference/incident face clipping.
fn convex_contact(
    verts_a: &[f32],
    count_a: usize,
    verts_b: &[f32],
    count_b: usize,
    out: &mut CollisionContactManifold2D,
) -> bool {
    if count_a < 3 || count_b < 3 {
        return false;
    }

    let (sep_a, face_a) = max_face_separation(verts_a, count_a, verts_b, count_b);
    if sep_a > 0.0 { return false; }
    let (sep_b, face_b) = max_face_separation(verts_b, count_b, verts_a, count_a);
    if sep_b > 0.0 { return false; }

    // Decide reference face
    let a_is_ref = sep_a >= sep_b - REFERENCE_BIAS;
    let (ref_verts, ref_count, ref_face, inc_verts, inc_count, flipped) = if a_is_ref {
        (verts_a, count_a, face_a, verts_b, count_b, false)
    } else {
        (verts_b, count_b, face_b, verts_a, count_a, true)
    };

    let ri = ref_face;
    let rj = (ref_face + 1) % ref_count;
    let ref_x0 = ref_verts[ri * 2];
    let ref_y0 = ref_verts[ri * 2 + 1];
    let ref_x1 = ref_verts[rj * 2];
    let ref_y1 = ref_verts[rj * 2 + 1];
    let ex = ref_x1 - ref_x0;
    let ey = ref_y1 - ref_y0;
    let e_len = (ex * ex + ey * ey).sqrt();
    if e_len < EPS { return false; }
    let ref_nx = ey / e_len;
    let ref_ny = -ex / e_len;

    // Find incident face
    let inc_face = most_anti_parallel_edge(inc_verts, inc_count, ref_nx, ref_ny);
    let ii = inc_face;
    let ij = (inc_face + 1) % inc_count;

    // Clip incident edge against reference face side planes
    let mut clip = [
        (inc_verts[ii * 2], inc_verts[ii * 2 + 1]),
        (inc_verts[ij * 2], inc_verts[ij * 2 + 1]),
    ];
    let mut clip_count = 2_usize;

    // Side plane 1: tangent direction at ref_x0
    let tan_x = ex / e_len;
    let tan_y = ey / e_len;
    let side1_offset = tan_x * ref_x0 + tan_y * ref_y0;
    clip_count = clip_against_plane(-tan_x, -tan_y, -side1_offset, &mut clip, clip_count);
    if clip_count < 2 { return false; }

    // Side plane 2: tangent direction at ref_x1
    let side2_offset = tan_x * ref_x1 + tan_y * ref_y1;
    clip_count = clip_against_plane(tan_x, tan_y, side2_offset, &mut clip, clip_count);
    if clip_count < 2 { return false; }

    // Filter by reference face plane
    let ref_offset = ref_nx * ref_x0 + ref_ny * ref_y0;

    let nx = if flipped { -ref_nx } else { ref_nx };
    let ny = if flipped { -ref_ny } else { ref_ny };

    out.overlapping = true;
    out.normal_x = nx;
    out.normal_y = ny;

    let mut pt_count = 0_usize;
    let mut max_depth = 0.0_f32;
    for i in 0..clip_count {
        let sep = ref_nx * clip[i].0 + ref_ny * clip[i].1 - ref_offset;
        if sep <= 0.0 && pt_count < MAX_COLLISION_CONTACT_POINTS_2D {
            out.points[pt_count].x = clip[i].0;
            out.points[pt_count].y = clip[i].1;
            out.points[pt_count].depth = -sep;
            out.points[pt_count].feature_id = pack_contact_feature_id(
                !flipped,
                ref_face as i64,
                inc_face as i64,
                pt_count > 0,
            );
            if -sep > max_depth { max_depth = -sep; }
            pt_count += 1;
        }
    }
    out.point_count = pt_count;
    out.depth = max_depth;

    return pt_count > 0;
}

fn max_face_separation(
    verts_a: &[f32],
    count_a: usize,
    verts_b: &[f32],
    count_b: usize,
) -> (f32, usize) {
    let mut max_sep = f32::NEG_INFINITY;
    let mut best_face = 0_usize;

    for i in 0..count_a {
        let j = (i + 1) % count_a;
        let ex = verts_a[j * 2] - verts_a[i * 2];
        let ey = verts_a[j * 2 + 1] - verts_a[i * 2 + 1];
        let len = (ex * ex + ey * ey).sqrt();
        if len < EPS { continue; }
        let nx = ey / len;
        let ny = -ex / len;

        let mut min_sep = f32::INFINITY;
        for k in 0..count_b {
            let d = (verts_b[k * 2] - verts_a[i * 2]) * nx + (verts_b[k * 2 + 1] - verts_a[i * 2 + 1]) * ny;
            if d < min_sep { min_sep = d; }
        }
        if min_sep > max_sep {
            max_sep = min_sep;
            best_face = i;
        }
    }
    return (max_sep, best_face);
}

fn most_anti_parallel_edge(
    verts: &[f32],
    count: usize,
    nx: f32,
    ny: f32,
) -> usize {
    let mut min_dot = f32::INFINITY;
    let mut best = 0_usize;
    for i in 0..count {
        let j = (i + 1) % count;
        let ex = verts[j * 2] - verts[i * 2];
        let ey = verts[j * 2 + 1] - verts[i * 2 + 1];
        let len = (ex * ex + ey * ey).sqrt();
        if len < EPS { continue; }
        let enx = ey / len;
        let eny = -ex / len;
        let dot = enx * nx + eny * ny;
        if dot < min_dot {
            min_dot = dot;
            best = i;
        }
    }
    return best;
}

fn polygon_vertices(poly: &CollisionPolygon2D) -> Vec<f32> {
    return poly.points.iter().map(|value| *value as f32).collect();
}

fn write_circle_contact(
    circle: &CollisionCircle2D,
    out: &mut CollisionContactManifold2D,
) {
    out.point_count = 1;
    out.points[0].x = circle.x as f32 - out.normal_x * circle.radius as f32;
    out.points[0].y = circle.y as f32 - out.normal_y * circle.radius as f32;
    out.points[0].depth = out.depth;
    out.points[0].feature_id = 0;
}
