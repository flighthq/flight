use crate::collision_support3d::*;
use crate::types::*;

const DISTANCE_TOLERANCE: f64 = 1e-12;
const DISTANCE_EPSILON: f64 = 1e-12;
const MAX_DISTANCE_ITERATIONS: usize = 32;

const TETRAHEDRON_FACES: [[usize; 3]; 4] = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
];

pub fn create_collision_distance3d() -> CollisionDistance3D {
    let mut out: CollisionDistance3D = flight_entity::allocate_entity();
    initialize_collision_distance3d(&mut out);
    return out;
}

pub fn initialize_collision_distance3d(out: &mut CollisionDistance3D) {
    out.distance = 0.0;
    out.direction_x = 0.0;
    out.direction_y = 0.0;
    out.direction_z = 0.0;
    out.point_a_x = 0.0;
    out.point_a_y = 0.0;
    out.point_a_z = 0.0;
    out.point_b_x = 0.0;
    out.point_b_y = 0.0;
    out.point_b_z = 0.0;
    out.overlapping = false;
}

fn closest_point_line(
    verts: &[[f64; 3]; 4],
) -> ([f64; 3], usize, [(usize, f64); 4]) {
    let a = verts[0];
    let b = verts[1];
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ao = [-a[0], -a[1], -a[2]];
    let ab_sq = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if ab_sq < DISTANCE_EPSILON {
        return (a, 1, [(0, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }
    let mut t = (ao[0] * ab[0] + ao[1] * ab[1] + ao[2] * ab[2]) / ab_sq;
    if t < 0.0 { t = 0.0; }
    if t > 1.0 { t = 1.0; }
    let closest = [
        a[0] + ab[0] * t,
        a[1] + ab[1] * t,
        a[2] + ab[2] * t,
    ];
    if t <= DISTANCE_EPSILON {
        return (closest, 1, [(0, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }
    if t >= 1.0 - DISTANCE_EPSILON {
        return (closest, 1, [(1, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }
    return (closest, 2, [(0, 1.0 - t), (1, t), (0, 0.0), (0, 0.0)]);
}

fn closest_point_tetrahedron(
    verts: &[[f64; 3]; 4],
) -> ([f64; 3], usize, [(usize, f64); 4]) {
    // Check if origin is inside tetrahedron
    let a = verts[0]; let b = verts[1]; let c = verts[2]; let d = verts[3];
    let ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    let ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    let ad = [d[0]-a[0], d[1]-a[1], d[2]-a[2]];
    let ao = [-a[0], -a[1], -a[2]];

    let abc_n = cross3_arr(&ab, &ac);
    let acd_n = cross3_arr(&ac, &ad);
    let adb_n = cross3_arr(&ad, &ab);

    let abc_dot = abc_n[0]*ao[0] + abc_n[1]*ao[1] + abc_n[2]*ao[2];
    let acd_dot = acd_n[0]*ao[0] + acd_n[1]*ao[1] + acd_n[2]*ao[2];
    let adb_dot = adb_n[0]*ao[0] + adb_n[1]*ao[1] + adb_n[2]*ao[2];

    // Check BCD face from D's perspective
    let bc = [c[0]-b[0], c[1]-b[1], c[2]-b[2]];
    let bd = [d[0]-b[0], d[1]-b[1], d[2]-b[2]];
    let bcd_n = cross3_arr(&bc, &bd);
    let bo = [-b[0], -b[1], -b[2]];
    let bcd_dot = bcd_n[0]*bo[0] + bcd_n[1]*bo[1] + bcd_n[2]*bo[2];

    let inside = (abc_dot >= 0.0 && acd_dot >= 0.0 && adb_dot >= 0.0 && bcd_dot >= 0.0)
              || (abc_dot <= 0.0 && acd_dot <= 0.0 && adb_dot <= 0.0 && bcd_dot <= 0.0);

    if inside {
        return ([0.0, 0.0, 0.0], 4, [(0, 0.25), (1, 0.25), (2, 0.25), (3, 0.25)]);
    }

    // Find closest point on each face
    let mut best_dist = f64::INFINITY;
    let mut best_pt = [0.0_f64; 3];
    let mut best_count = 1_usize;
    let mut best_bary = [(0_usize, 0.0_f64); 4];

    for face in &TETRAHEDRON_FACES {
        let mut tri = [[0.0_f64; 3]; 4];
        tri[0] = verts[face[0]];
        tri[1] = verts[face[1]];
        tri[2] = verts[face[2]];
        let (pt, cnt, bary) = closest_point_triangle(&tri);
        let dist = pt[0]*pt[0] + pt[1]*pt[1] + pt[2]*pt[2];
        if dist < best_dist {
            best_dist = dist;
            best_pt = pt;
            best_count = cnt;
            for i in 0..4 {
                if i < cnt {
                    best_bary[i] = (face[bary[i].0], bary[i].1);
                } else {
                    best_bary[i] = (0, 0.0);
                }
            }
        }
    }

    return (best_pt, best_count, best_bary);
}

/// Returns (closest_point, vertex_count, [(original_index, barycentric_weight)])
fn closest_point_to_origin(
    verts: &[[f64; 3]; 4],
    count: usize,
) -> ([f64; 3], usize, [(usize, f64); 4]) {
    match count {
        1 => {
            return (verts[0], 1, [(0, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
        }
        2 => closest_point_line(verts),
        3 => closest_point_triangle(verts),
        4 => closest_point_tetrahedron(verts),
        _ => ([0.0; 3], 0, [(0, 0.0); 4]),
    }
}

fn closest_point_triangle(
    verts: &[[f64; 3]; 4],
) -> ([f64; 3], usize, [(usize, f64); 4]) {
    let a = verts[0];
    let b = verts[1];
    let c = verts[2];

    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let ao = [-a[0], -a[1], -a[2]];

    let d1 = ab[0] * ao[0] + ab[1] * ao[1] + ab[2] * ao[2];
    let d2 = ac[0] * ao[0] + ac[1] * ao[1] + ac[2] * ao[2];
    if d1 <= 0.0 && d2 <= 0.0 {
        return (a, 1, [(0, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }

    let bo = [-b[0], -b[1], -b[2]];
    let d3 = ab[0] * bo[0] + ab[1] * bo[1] + ab[2] * bo[2];
    let d4 = ac[0] * bo[0] + ac[1] * bo[1] + ac[2] * bo[2];
    if d3 >= 0.0 && d4 <= d3 {
        return (b, 1, [(1, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }

    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        let pt = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
        return (pt, 2, [(0, 1.0 - v), (1, v), (0, 0.0), (0, 0.0)]);
    }

    let co = [-c[0], -c[1], -c[2]];
    let d5 = ab[0] * co[0] + ab[1] * co[1] + ab[2] * co[2];
    let d6 = ac[0] * co[0] + ac[1] * co[1] + ac[2] * co[2];
    if d6 >= 0.0 && d5 <= d6 {
        return (c, 1, [(2, 1.0), (0, 0.0), (0, 0.0), (0, 0.0)]);
    }

    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        let pt = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
        return (pt, 2, [(0, 1.0 - w), (2, w), (0, 0.0), (0, 0.0)]);
    }

    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        let pt = [
            b[0] + (c[0] - b[0]) * w,
            b[1] + (c[1] - b[1]) * w,
            b[2] + (c[2] - b[2]) * w,
        ];
        return (pt, 2, [(1, 1.0 - w), (2, w), (0, 0.0), (0, 0.0)]);
    }

    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    let pt = [
        a[0] + ab[0] * v + ac[0] * w,
        a[1] + ab[1] * v + ac[1] * w,
        a[2] + ab[2] * v + ac[2] * w,
    ];
    return (pt, 3, [(0, 1.0 - v - w), (1, v), (2, w), (0, 0.0)]);
}

fn cross3_arr(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    ]
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn write_collision_distance3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionDistance3D,
) -> bool {
    initialize_collision_distance3d(out);

    let mut support_a = [0.0_f64; 3];
    let mut support_b = [0.0_f64; 3];
    if !write_collision_support3d(registry, a, 1.0, 0.0, 0.0, &mut support_a) {
        return false;
    }
    if !write_collision_support3d(registry, b, -1.0, 0.0, 0.0, &mut support_b) {
        return false;
    }

    let mut simplex_a = [[0.0_f64; 3]; 4];
    let mut simplex_b = [[0.0_f64; 3]; 4];
    let mut simplex_w = [[0.0_f64; 3]; 4];
    simplex_a[0] = support_a;
    simplex_b[0] = support_b;
    simplex_w[0] = [
        support_a[0] - support_b[0],
        support_a[1] - support_b[1],
        support_a[2] - support_b[2],
    ];
    let mut simplex_count = 1_usize;

    // closest tracks the closest point on the current simplex to the origin.
    let mut closest_x = simplex_w[0][0];
    let mut closest_y = simplex_w[0][1];
    let mut closest_z = simplex_w[0][2];

    for _iteration in 0..MAX_DISTANCE_ITERATIONS {
        let closest_len_sq = closest_x * closest_x + closest_y * closest_y + closest_z * closest_z;
        if closest_len_sq <= DISTANCE_EPSILON * DISTANCE_EPSILON {
            // Origin is inside the Minkowski difference: shapes overlap.
            out.overlapping = true;
            out.distance = 0.0;
            return false;
        }

        // Search toward the origin from the current closest point.
        if !write_collision_support3d(
            registry,
            a,
            -closest_x,
            -closest_y,
            -closest_z,
            &mut support_a,
        ) {
            return false;
        }
        if !write_collision_support3d(
            registry,
            b,
            closest_x,
            closest_y,
            closest_z,
            &mut support_b,
        ) {
            return false;
        }
        let w = [
            support_a[0] - support_b[0],
            support_a[1] - support_b[1],
            support_a[2] - support_b[2],
        ];

        // Convergence: progress = |closest|^2 - w.closest
        // If this is small relative to |closest|^2, the search cannot improve.
        let w_dot_closest = w[0] * closest_x + w[1] * closest_y + w[2] * closest_z;
        let progress = closest_len_sq - w_dot_closest;
        if progress <= DISTANCE_TOLERANCE * closest_len_sq {
            break;
        }

        // A support point already in the simplex means the search has stalled.
        let mut duplicate = false;
        for i in 0..simplex_count {
            if simplex_w[i][0] == w[0] && simplex_w[i][1] == w[1] && simplex_w[i][2] == w[2] {
                duplicate = true;
                break;
            }
        }
        if duplicate {
            break;
        }

        simplex_a[simplex_count] = support_a;
        simplex_b[simplex_count] = support_b;
        simplex_w[simplex_count] = w;
        simplex_count += 1;

        let (closest_pt, new_count, bary) =
            closest_point_to_origin(&simplex_w, simplex_count);

        if new_count >= 4 {
            // Tetrahedron encloses origin -> overlapping.
            out.overlapping = true;
            out.distance = 0.0;
            return false;
        }

        // Reduce simplex: compact surviving vertices to front.
        let mut new_a = [[0.0_f64; 3]; 4];
        let mut new_b = [[0.0_f64; 3]; 4];
        let mut new_w = [[0.0_f64; 3]; 4];
        for i in 0..new_count {
            new_a[i] = simplex_a[bary[i].0];
            new_b[i] = simplex_b[bary[i].0];
            new_w[i] = simplex_w[bary[i].0];
        }
        simplex_a = new_a;
        simplex_b = new_b;
        simplex_w = new_w;
        simplex_count = new_count;

        closest_x = closest_pt[0];
        closest_y = closest_pt[1];
        closest_z = closest_pt[2];
    }

    // Compute witness points using barycentric coordinates
    let (closest, count, bary) =
        closest_point_to_origin(&simplex_w, simplex_count);
    let dist_sq = closest[0] * closest[0] + closest[1] * closest[1] + closest[2] * closest[2];
    let dist = dist_sq.sqrt();

    if dist < DISTANCE_EPSILON {
        out.overlapping = true;
        out.distance = 0.0;
        return false;
    }

    let mut pa = [0.0_f64; 3];
    let mut pb = [0.0_f64; 3];
    for i in 0..count {
        let idx = bary[i].0;
        let w = bary[i].1;
        pa[0] += simplex_a[idx][0] * w;
        pa[1] += simplex_a[idx][1] * w;
        pa[2] += simplex_a[idx][2] * w;
        pb[0] += simplex_b[idx][0] * w;
        pb[1] += simplex_b[idx][1] * w;
        pb[2] += simplex_b[idx][2] * w;
    }

    out.distance = dist;
    out.direction_x = closest[0] / dist;
    out.direction_y = closest[1] / dist;
    out.direction_z = closest[2] / dist;
    out.point_a_x = pa[0];
    out.point_a_y = pa[1];
    out.point_a_z = pa[2];
    out.point_b_x = pb[0];
    out.point_b_y = pb[1];
    out.point_b_z = pb[2];
    out.overlapping = false;
    return true;
}

// flight-lint: allow(f64) support directions share the GJK distance solver's 1e-12 termination threshold
fn write_collision_support3d(
    registry: &CollisionRegistry3D,
    shape: &CollisionShape3D,
    direction_x: f64,
    direction_y: f64,
    direction_z: f64,
    out: &mut [f64; 3],
) -> bool {
    let kind = get_collision_shape3d_kind_key(shape);
    let Some(support) = get_collision_support3d(registry, kind) else {
        return false;
    };
    support(shape, direction_x, direction_y, direction_z, out);
    return true;
}
