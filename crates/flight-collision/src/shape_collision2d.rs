use crate::collision_shape_validation2d::*;
use crate::convex_vertices2d::*;
use crate::manifold2d::*;
use crate::types::*;

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision relative tolerance
const RELATIVE_EPSILON: f64 = 1e-9;

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision axes and projections
fn accumulate_polygon_axes(
    sx: &[f64],
    sn: usize,
    ax: &[f64],
    an: usize,
    bx: &[f64],
    bn: usize,
    epsilon: f64,
    out: &mut CollisionManifold2D,
    best_overlap: &mut f64,
    best_sign: &mut f64,
    best_x: &mut f64,
    best_y: &mut f64,
) -> bool {
    for i in 0..sn {
        let j = (i + 1) % sn;
        let x0 = sx[i * 2];
        let y0 = sx[i * 2 + 1];
        let x1 = sx[j * 2];
        let y1 = sx[j * 2 + 1];
        let mut nax = y1 - y0;
        let mut nay = -(x1 - x0);
        let len = (nax * nax + nay * nay).sqrt();
        if len <= epsilon {
            continue;
        }
        nax /= len;
        nay /= len;
        canonicalize_axis(&mut nax, &mut nay);
        let (overlap, sign) = polygon_axis_overlap(nax, nay, ax, an, bx, bn);
        if overlap <= epsilon {
            clear_collision_manifold2d(out);
            return false;
        }
        if is_preferred_axis(overlap, nax, nay, *best_overlap, *best_x, *best_y, epsilon) {
            *best_overlap = overlap;
            *best_sign = sign;
            *best_x = nax;
            *best_y = nay;
        }
    }
    return true;
}

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision axis canonicalization
fn canonicalize_axis(ax: &mut f64, ay: &mut f64) {
    if *ax < -RELATIVE_EPSILON || ((*ax).abs() <= RELATIVE_EPSILON && *ay < 0.0) {
        *ax = -*ax;
        *ay = -*ay;
    }
}

fn circle_aabb_overlap(
    cx: f32,
    cy: f32,
    radius: f32,
    min_x: f32,
    min_y: f32,
    max_x: f32,
    max_y: f32,
    out: &mut CollisionManifold2D,
) -> bool {
    let closest_x = if cx < min_x {
        min_x
    } else if cx > max_x {
        max_x
    } else {
        cx
    };
    let closest_y = if cy < min_y {
        min_y
    } else if cy > max_y {
        max_y
    } else {
        cy
    };
    let dx = cx - closest_x;
    let dy = cy - closest_y;
    let dist_squared = dx * dx + dy * dy;
    let extent = f32::max(f32::max(max_x - min_x, max_y - min_y), radius);
    let epsilon = if extent > 0.0 {
        extent * 1e-6
    } else {
        f32::EPSILON
    };

    if dist_squared > epsilon * epsilon {
        let dist = dist_squared.sqrt();
        if dist >= radius {
            clear_collision_manifold2d(out);
            return false;
        }
        let inv = 1.0 / dist;
        out.normal_x = dx * inv;
        out.normal_y = dy * inv;
        out.depth = radius - dist;
        out.overlapping = true;
        return true;
    }

    let left = cx - min_x;
    let right = max_x - cx;
    let bottom = cy - min_y;
    let top = max_y - cy;
    let mut min_dist = right;
    let mut normal_x = 1.0_f32;
    let mut normal_y = 0.0_f32;
    if left < min_dist {
        min_dist = left;
        normal_x = -1.0;
        normal_y = 0.0;
    }
    if bottom < min_dist {
        min_dist = bottom;
        normal_x = 0.0;
        normal_y = -1.0;
    }
    if top < min_dist {
        min_dist = top;
        normal_x = 0.0;
        normal_y = 1.0;
    }
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.depth = min_dist + radius;
    out.overlapping = true;
    return true;
}

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision circle projections
fn circle_polygon_axis_overlap(
    axis_x: f64,
    axis_y: f64,
    cx: f64,
    cy: f64,
    radius: f64,
    px: &[f64],
    pn: usize,
) -> (f64, f64) {
    let origin_x = px[0];
    let origin_y = px[1];
    let mut min_p = f64::INFINITY;
    let mut max_p = f64::NEG_INFINITY;
    for i in 0..pn {
        let d = (px[i * 2] - origin_x) * axis_x + (px[i * 2 + 1] - origin_y) * axis_y;
        if d < min_p {
            min_p = d;
        }
        if d > max_p {
            max_p = d;
        }
    }
    let c = (cx - origin_x) * axis_x + (cy - origin_y) * axis_y;
    let c_min = c - radius;
    let c_max = c + radius;
    let pen_negative = c_max - min_p;
    let pen_positive = max_p - c_min;
    if pen_negative < pen_positive {
        return (pen_negative, -1.0);
    }
    return (pen_positive, 1.0);
}

// flight-lint: allow(f64) measured 1e15 polygon storage needs double-precision SAT extents
fn get_polygon_extent(points: &[f64], count: usize) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for i in 0..count {
        let x = points[i * 2];
        let y = points[i * 2 + 1];
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
    return f64::max(max_x - min_x, max_y - min_y);
}

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs stable double-precision tie breaking
fn is_preferred_axis(
    overlap: f64,
    axis_x: f64,
    axis_y: f64,
    current_overlap: f64,
    current_x: f64,
    current_y: f64,
    epsilon: f64,
) -> bool {
    if overlap < current_overlap - epsilon {
        return true;
    }
    if (overlap - current_overlap).abs() > epsilon {
        return false;
    }
    if axis_x > current_x + RELATIVE_EPSILON {
        return true;
    }
    return (axis_x - current_x).abs() <= RELATIVE_EPSILON && axis_y > current_y;
}

fn is_valid_aabb(shape: &CollisionAabb2D) -> bool {
    return shape.min_x.is_finite()
        && shape.min_y.is_finite()
        && shape.max_x.is_finite()
        && shape.max_y.is_finite()
        && shape.max_x > shape.min_x
        && shape.max_y > shape.min_y;
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

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision projections
fn polygon_axis_overlap(
    axis_x: f64,
    axis_y: f64,
    ax: &[f64],
    an: usize,
    bx: &[f64],
    bn: usize,
) -> (f64, f64) {
    let origin_x = ax[0];
    let origin_y = ax[1];
    let mut min_a = f64::INFINITY;
    let mut max_a = f64::NEG_INFINITY;
    for i in 0..an {
        let d = (ax[i * 2] - origin_x) * axis_x + (ax[i * 2 + 1] - origin_y) * axis_y;
        if d < min_a {
            min_a = d;
        }
        if d > max_a {
            max_a = d;
        }
    }
    let mut min_b = f64::INFINITY;
    let mut max_b = f64::NEG_INFINITY;
    for i in 0..bn {
        let d = (bx[i * 2] - origin_x) * axis_x + (bx[i * 2 + 1] - origin_y) * axis_y;
        if d < min_b {
            min_b = d;
        }
        if d > max_b {
            max_b = d;
        }
    }
    let pen_negative = max_a - min_b;
    let pen_positive = max_b - min_a;
    if pen_negative < pen_positive {
        return (pen_negative, -1.0);
    }
    return (pen_positive, 1.0);
}

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision relative tolerance
fn relative_epsilon(extent: f64) -> f64 {
    if extent > 0.0 {
        return extent * RELATIVE_EPSILON;
    }
    return f64::EPSILON;
}

// flight-lint: allow(f64) measured 1e15 polygon SAT retains a coherent double-precision circle-axis domain
fn sat_circle_convex_overlap(
    cx: f64,
    cy: f64,
    radius: f64,
    px: &[f64],
    pn: usize,
    out: &mut CollisionManifold2D,
) -> bool {
    let extent = f64::max(get_polygon_extent(px, pn), radius);
    let epsilon = relative_epsilon(extent);
    let mut min_overlap = f64::INFINITY;
    let mut min_overlap_sign = 1.0_f64;
    let mut normal_x = 0.0_f64;
    let mut normal_y = 0.0_f64;

    for i in 0..pn {
        let j = (i + 1) % pn;
        let x0 = px[i * 2];
        let y0 = px[i * 2 + 1];
        let x1 = px[j * 2];
        let y1 = px[j * 2 + 1];
        let mut ax = y1 - y0;
        let mut ay = -(x1 - x0);
        let len = (ax * ax + ay * ay).sqrt();
        if len <= epsilon {
            continue;
        }
        ax /= len;
        ay /= len;
        canonicalize_axis(&mut ax, &mut ay);
        let (overlap, sign) = circle_polygon_axis_overlap(ax, ay, cx, cy, radius, px, pn);
        if overlap <= epsilon {
            clear_collision_manifold2d(out);
            return false;
        }
        if is_preferred_axis(overlap, ax, ay, min_overlap, normal_x, normal_y, epsilon) {
            min_overlap = overlap;
            min_overlap_sign = sign;
            normal_x = ax;
            normal_y = ay;
        }
    }

    let mut nearest_x = 0.0_f64;
    let mut nearest_y = 0.0_f64;
    let mut nearest_dist_sq = f64::INFINITY;
    for i in 0..pn {
        let vx = px[i * 2];
        let vy = px[i * 2 + 1];
        let ddx = cx - vx;
        let ddy = cy - vy;
        let d2 = ddx * ddx + ddy * ddy;
        if d2 < nearest_dist_sq {
            nearest_dist_sq = d2;
            nearest_x = vx;
            nearest_y = vy;
        }
    }
    let mut vax = cx - nearest_x;
    let mut vay = cy - nearest_y;
    let vertex_axis_len = (vax * vax + vay * vay).sqrt();
    if vertex_axis_len > epsilon {
        vax /= vertex_axis_len;
        vay /= vertex_axis_len;
        canonicalize_axis(&mut vax, &mut vay);
        let (overlap, sign) = circle_polygon_axis_overlap(vax, vay, cx, cy, radius, px, pn);
        if overlap <= epsilon {
            clear_collision_manifold2d(out);
            return false;
        }
        if is_preferred_axis(overlap, vax, vay, min_overlap, normal_x, normal_y, epsilon) {
            min_overlap = overlap;
            min_overlap_sign = sign;
            normal_x = vax;
            normal_y = vay;
        }
    }

    if min_overlap == f64::INFINITY {
        clear_collision_manifold2d(out);
        return false;
    }

    normal_x *= min_overlap_sign;
    normal_y *= min_overlap_sign;
    out.normal_x = if normal_x == 0.0 {
        0.0
    } else {
        normal_x as f32
    };
    out.normal_y = if normal_y == 0.0 {
        0.0
    } else {
        normal_y as f32
    };
    out.depth = min_overlap as f32;
    out.overlapping = true;
    return true;
}

// flight-lint: allow(f64) measured 1e15 translated-polygon SAT needs double-precision axes and projections
fn sat_convex_overlap(
    ax: &[f64],
    an: usize,
    bx: &[f64],
    bn: usize,
    out: &mut CollisionManifold2D,
) -> bool {
    let extent = f64::max(get_polygon_extent(ax, an), get_polygon_extent(bx, bn));
    let epsilon = relative_epsilon(extent);
    let mut best_overlap = f64::INFINITY;
    let mut best_sign = 1.0_f64;
    let mut best_x = 0.0_f64;
    let mut best_y = 0.0_f64;

    if !accumulate_polygon_axes(
        ax,
        an,
        ax,
        an,
        bx,
        bn,
        epsilon,
        out,
        &mut best_overlap,
        &mut best_sign,
        &mut best_x,
        &mut best_y,
    ) {
        return false;
    }
    if !accumulate_polygon_axes(
        bx,
        bn,
        ax,
        an,
        bx,
        bn,
        epsilon,
        out,
        &mut best_overlap,
        &mut best_sign,
        &mut best_x,
        &mut best_y,
    ) {
        return false;
    }
    if best_overlap == f64::INFINITY {
        clear_collision_manifold2d(out);
        return false;
    }

    let nx = best_x * best_sign;
    let ny = best_y * best_sign;
    out.normal_x = if nx == 0.0 { 0.0 } else { nx as f32 };
    out.normal_y = if ny == 0.0 { 0.0 } else { ny as f32 };
    out.depth = best_overlap as f32;
    out.overlapping = true;
    return true;
}

pub fn test_aabb_aabb_collision2d(
    a: &CollisionAabb2D,
    b: &CollisionAabb2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_aabb(a) || !is_valid_aabb(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    let a_min_x = a.min_x;
    let a_min_y = a.min_y;
    let a_max_x = a.max_x;
    let a_max_y = a.max_y;
    let b_min_x = b.min_x;
    let b_min_y = b.min_y;
    let b_max_x = b.max_x;
    let b_max_y = b.max_y;

    let pen_left_x = a_max_x - b_min_x;
    let pen_right_x = b_max_x - a_min_x;
    let overlap_x = if pen_left_x < pen_right_x {
        pen_left_x
    } else {
        pen_right_x
    };
    let pen_down_y = a_max_y - b_min_y;
    let pen_up_y = b_max_y - a_min_y;
    let overlap_y = if pen_down_y < pen_up_y {
        pen_down_y
    } else {
        pen_up_y
    };

    if overlap_x <= 0.0 || overlap_y <= 0.0 {
        clear_collision_manifold2d(out);
        return false;
    }

    if overlap_x <= overlap_y {
        out.normal_x = if pen_left_x < pen_right_x { -1.0 } else { 1.0 };
        out.normal_y = 0.0;
        out.depth = overlap_x;
    } else {
        out.normal_x = 0.0;
        out.normal_y = if pen_down_y < pen_up_y { -1.0 } else { 1.0 };
        out.depth = overlap_y;
    }
    out.overlapping = true;
    return true;
}

// flight-lint: allow(f64) this SAT entry shares the measured 1e15 double-precision polygon kernel
pub fn test_aabb_obb_collision2d(
    a: &CollisionAabb2D,
    b: &CollisionObb2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_aabb(a) || !is_valid_obb(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    let mut vertices_a_f32 = [0.0_f32; 8];
    let mut vertices_b_f32 = [0.0_f32; 8];
    write_aabb_vertices(a, &mut vertices_a_f32);
    write_obb_vertices(b, &mut vertices_b_f32);
    let vertices_a = vertices_a_f32.map(f64::from);
    let vertices_b = vertices_b_f32.map(f64::from);
    return sat_convex_overlap(&vertices_a, 4, &vertices_b, 4, out);
}

// flight-lint: allow(f64) measured 1e15 polygon SAT widens AABB vertices into the retained domain
pub fn test_aabb_polygon_collision2d(
    a: &CollisionAabb2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_aabb(a) || get_collision_polygon_validation_status2d(&b.points).is_some() {
        clear_collision_manifold2d(out);
        return false;
    }
    let mut vertices_a_f32 = [0.0_f32; 8];
    write_aabb_vertices(a, &mut vertices_a_f32);
    let vertices_a = vertices_a_f32.map(f64::from);
    return sat_convex_overlap(&vertices_a, 4, &b.points, b.points.len() / 2, out);
}

pub fn test_circle_aabb_collision2d(
    a: &CollisionCircle2D,
    b: &CollisionAabb2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_circle(a) || !is_valid_aabb(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    return circle_aabb_overlap(
        a.x as f32,
        a.y as f32,
        a.radius as f32,
        b.min_x,
        b.min_y,
        b.max_x,
        b.max_y,
        out,
    );
}

pub fn test_circle_circle_collision2d(
    a: &CollisionCircle2D,
    b: &CollisionCircle2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_circle(a) || !is_valid_circle(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    let ax = a.x as f32;
    let ay = a.y as f32;
    let bx = b.x as f32;
    let by = b.y as f32;
    let radius_sum = a.radius as f32 + b.radius as f32;

    let dx = ax - bx;
    let dy = ay - by;
    let dist_squared = dx * dx + dy * dy;
    if dist_squared >= radius_sum * radius_sum {
        clear_collision_manifold2d(out);
        return false;
    }

    let dist = dist_squared.sqrt();
    let epsilon = if radius_sum > 0.0 {
        radius_sum * 1e-6
    } else {
        f32::EPSILON
    };
    if dist > epsilon {
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
    return true;
}

pub fn test_circle_obb_collision2d(
    a: &CollisionCircle2D,
    b: &CollisionObb2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_circle(a) || !is_valid_obb(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    let cx = a.x as f32;
    let cy = a.y as f32;
    let radius = a.radius as f32;
    let half_w = b.half_w;
    let half_h = b.half_h;
    let cos = b.rotation.cos();
    let sin = b.rotation.sin();

    let dx = cx - b.x;
    let dy = cy - b.y;
    let local_x = dx * cos + dy * sin;
    let local_y = -dx * sin + dy * cos;
    if !circle_aabb_overlap(
        local_x, local_y, radius, -half_w, -half_h, half_w, half_h, out,
    ) {
        return false;
    }

    let local_normal_x = out.normal_x;
    let local_normal_y = out.normal_y;
    out.normal_x = local_normal_x * cos - local_normal_y * sin;
    out.normal_y = local_normal_x * sin + local_normal_y * cos;
    return true;
}

pub fn test_circle_polygon_collision2d(
    a: &CollisionCircle2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_circle(a) || get_collision_polygon_validation_status2d(&b.points).is_some() {
        clear_collision_manifold2d(out);
        return false;
    }
    return sat_circle_convex_overlap(a.x, a.y, a.radius, &b.points, b.points.len() / 2, out);
}

// flight-lint: allow(f64) this SAT entry shares the measured 1e15 double-precision polygon kernel
pub fn test_obb_obb_collision2d(
    a: &CollisionObb2D,
    b: &CollisionObb2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_obb(a) || !is_valid_obb(b) {
        clear_collision_manifold2d(out);
        return false;
    }
    let mut vertices_a_f32 = [0.0_f32; 8];
    let mut vertices_b_f32 = [0.0_f32; 8];
    write_obb_vertices(a, &mut vertices_a_f32);
    write_obb_vertices(b, &mut vertices_b_f32);
    let vertices_a = vertices_a_f32.map(f64::from);
    let vertices_b = vertices_b_f32.map(f64::from);
    return sat_convex_overlap(&vertices_a, 4, &vertices_b, 4, out);
}

// flight-lint: allow(f64) measured 1e15 polygon SAT widens OBB vertices into the retained domain
pub fn test_obb_polygon_collision2d(
    a: &CollisionObb2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if !is_valid_obb(a) || get_collision_polygon_validation_status2d(&b.points).is_some() {
        clear_collision_manifold2d(out);
        return false;
    }
    let mut vertices_a_f32 = [0.0_f32; 8];
    write_obb_vertices(a, &mut vertices_a_f32);
    let vertices_a = vertices_a_f32.map(f64::from);
    return sat_convex_overlap(&vertices_a, 4, &b.points, b.points.len() / 2, out);
}

// flight-lint: allow(f64) measured 1e15 translation: f32 collapses both 10-unit polygons; f64 reports the expected 2-unit overlap
pub fn test_polygon_polygon_collision2d(
    a: &CollisionPolygon2D,
    b: &CollisionPolygon2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if get_collision_polygon_validation_status2d(&a.points).is_some()
        || get_collision_polygon_validation_status2d(&b.points).is_some()
    {
        clear_collision_manifold2d(out);
        return false;
    }
    return sat_convex_overlap(
        &a.points,
        a.points.len() / 2,
        &b.points,
        b.points.len() / 2,
        out,
    );
}
