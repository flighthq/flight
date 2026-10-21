use crate::collision_support3d::*;
use crate::types::*;

// flight-lint: allow(f64) measured crossing-capsule witness: f32 reports pointAX 0.00003552442 instead of source six-digit zero
const DISTANCE_TOLERANCE: f64 = 1e-12;
// flight-lint: allow(f64) the measured private distance simplex keeps the source 1e-12 touching boundary
const DISTANCE_EPSILON: f64 = 1e-12;
const MAX_DISTANCE_ITERATIONS: usize = 32;

const TETRAHEDRON_FACES: [[usize; 4]; 4] = [[0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2], [1, 3, 2, 0]];

// flight-lint: allow(f64) private simplex coordinates preserve the measured crossing-capsule interior witness; public shapes/results remain f32
type DistanceVector3 = [f64; 3];

// flight-lint: allow(f64) private simplex coordinates and barycentric weights preserve the measured crossing-capsule interior witness
struct CollisionDistanceSimplex3D {
    simplex: [DistanceVector3; 4],
    simplex_a: [DistanceVector3; 4],
    simplex_b: [DistanceVector3; 4],
    reduced_count: usize,
    reduced_indices: [usize; 3],
    reduced_weights: [f64; 3],
}

pub fn create_collision_distance3d() -> CollisionDistance3D {
    let mut out: CollisionDistance3D = flight_entity::allocate_entity();
    initialize_collision_distance3d(&mut out);
    return out;
}

// flight-lint: allow(f64) constructs only the measured private distance-simplex scratch
fn create_collision_distance_simplex3d() -> CollisionDistanceSimplex3D {
    CollisionDistanceSimplex3D {
        simplex: [[0.0; 3]; 4],
        simplex_a: [[0.0; 3]; 4],
        simplex_b: [[0.0; 3]; 4],
        reduced_count: 1,
        reduced_indices: [0; 3],
        reduced_weights: [1.0, 0.0, 0.0],
    }
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

// flight-lint: allow(f64) compacts the measured private simplex, paired supports, and barycentric ordering together
fn compact_collision_distance_simplex3d(simplex: &mut CollisionDistanceSimplex3D) {
    let mut compact = [[0.0_f64; 3]; 3];
    let mut compact_a = [[0.0_f64; 3]; 3];
    let mut compact_b = [[0.0_f64; 3]; 3];
    for slot in 0..simplex.reduced_count {
        let source = simplex.reduced_indices[slot];
        compact[slot] = simplex.simplex[source];
        compact_a[slot] = simplex.simplex_a[source];
        compact_b[slot] = simplex.simplex_b[source];
    }
    for slot in 0..simplex.reduced_count {
        simplex.simplex[slot] = compact[slot];
        simplex.simplex_a[slot] = compact_a[slot];
        simplex.simplex_b[slot] = compact_b[slot];
        simplex.reduced_indices[slot] = slot;
    }
}

// flight-lint: allow(f64) duplicate detection stays in the measured private distance-simplex domain
fn contains_collision_distance_simplex_point3d(
    simplex: &CollisionDistanceSimplex3D,
    count: usize,
    x: f64,
    y: f64,
    z: f64,
) -> bool {
    for point in &simplex.simplex[..count] {
        if point[0] == x && point[1] == y && point[2] == z {
            return true;
        }
    }
    return false;
}

// flight-lint: allow(f64) face-side predicates stay in the measured private distance-simplex domain
fn is_collision_distance_origin_outside_face3d(
    simplex: &CollisionDistanceSimplex3D,
    i0: usize,
    i1: usize,
    i2: usize,
    opposite: usize,
) -> bool {
    let [a_x, a_y, a_z] = simplex.simplex[i0];
    let e1_x = simplex.simplex[i1][0] - a_x;
    let e1_y = simplex.simplex[i1][1] - a_y;
    let e1_z = simplex.simplex[i1][2] - a_z;
    let e2_x = simplex.simplex[i2][0] - a_x;
    let e2_y = simplex.simplex[i2][1] - a_y;
    let e2_z = simplex.simplex[i2][2] - a_z;
    let normal_x = e1_y * e2_z - e1_z * e2_y;
    let normal_y = e1_z * e2_x - e1_x * e2_z;
    let normal_z = e1_x * e2_y - e1_y * e2_x;
    let toward_origin = -(normal_x * a_x + normal_y * a_y + normal_z * a_z);
    let toward_opposite = normal_x * (simplex.simplex[opposite][0] - a_x)
        + normal_y * (simplex.simplex[opposite][1] - a_y)
        + normal_z * (simplex.simplex[opposite][2] - a_z);
    return toward_origin * toward_opposite < 0.0;
}

// flight-lint: allow(f64) segment projection preserves the measured private distance-simplex reduction domain
fn reduce_collision_distance_segment3d(
    simplex: &mut CollisionDistanceSimplex3D,
    out: &mut DistanceVector3,
) -> usize {
    let [a_x, a_y, a_z] = simplex.simplex[0];
    let ab_x = simplex.simplex[1][0] - a_x;
    let ab_y = simplex.simplex[1][1] - a_y;
    let ab_z = simplex.simplex[1][2] - a_z;
    let length_squared = ab_x * ab_x + ab_y * ab_y + ab_z * ab_z;
    if length_squared <= 0.0 {
        *out = [a_x, a_y, a_z];
        return write_collision_distance_reduction3d(simplex, 1, 0, 0, 0, 1.0, 0.0, 0.0);
    }

    let t = -(a_x * ab_x + a_y * ab_y + a_z * ab_z) / length_squared;
    if t <= 0.0 {
        *out = [a_x, a_y, a_z];
        return write_collision_distance_reduction3d(simplex, 1, 0, 0, 0, 1.0, 0.0, 0.0);
    }
    if t >= 1.0 {
        *out = simplex.simplex[1];
        return write_collision_distance_reduction3d(simplex, 1, 1, 0, 0, 1.0, 0.0, 0.0);
    }
    *out = [a_x + ab_x * t, a_y + ab_y * t, a_z + ab_z * t];
    return write_collision_distance_reduction3d(simplex, 2, 0, 1, 0, 1.0 - t, t, 0.0);
}

// flight-lint: allow(f64) dispatches only the measured private distance-simplex reductions
fn reduce_collision_distance_simplex3d(
    simplex: &mut CollisionDistanceSimplex3D,
    count: usize,
    out: &mut DistanceVector3,
) -> usize {
    if count == 1 {
        *out = simplex.simplex[0];
        return write_collision_distance_reduction3d(simplex, 1, 0, 0, 0, 1.0, 0.0, 0.0);
    }
    if count == 2 {
        return reduce_collision_distance_segment3d(simplex, out);
    }
    if count == 3 {
        return reduce_collision_distance_triangle3d(simplex, 0, 1, 2, out);
    }
    return reduce_collision_distance_tetrahedron3d(simplex, out);
}

// flight-lint: allow(f64) tetrahedron face selection preserves the measured private closest-point predicates and barycentric weights
fn reduce_collision_distance_tetrahedron3d(
    simplex: &mut CollisionDistanceSimplex3D,
    out: &mut DistanceVector3,
) -> usize {
    let mut best_distance_squared = f64::INFINITY;
    let mut outside = false;
    let mut best_reduced_count = 0;
    let mut best_reduced_indices = [0_usize; 3];
    let mut best_reduced_weights = [0.0_f64; 3];

    for [i0, i1, i2, opposite] in TETRAHEDRON_FACES {
        if !is_collision_distance_origin_outside_face3d(simplex, i0, i1, i2, opposite) {
            continue;
        }
        outside = true;
        let mut face_closest = [0.0_f64; 3];
        reduce_collision_distance_triangle3d(simplex, i0, i1, i2, &mut face_closest);
        let distance_squared = face_closest[0] * face_closest[0]
            + face_closest[1] * face_closest[1]
            + face_closest[2] * face_closest[2];
        if distance_squared >= best_distance_squared {
            continue;
        }
        best_distance_squared = distance_squared;
        *out = face_closest;
        best_reduced_count = simplex.reduced_count;
        best_reduced_indices[..simplex.reduced_count]
            .copy_from_slice(&simplex.reduced_indices[..simplex.reduced_count]);
        best_reduced_weights[..simplex.reduced_count]
            .copy_from_slice(&simplex.reduced_weights[..simplex.reduced_count]);
    }

    if !outside {
        return 4;
    }
    simplex.reduced_count = best_reduced_count;
    simplex.reduced_indices[..best_reduced_count]
        .copy_from_slice(&best_reduced_indices[..best_reduced_count]);
    simplex.reduced_weights[..best_reduced_count]
        .copy_from_slice(&best_reduced_weights[..best_reduced_count]);
    return simplex.reduced_count;
}

// flight-lint: allow(f64) triangle Voronoi reduction preserves the measured private barycentric witness domain
fn reduce_collision_distance_triangle3d(
    simplex: &mut CollisionDistanceSimplex3D,
    i0: usize,
    i1: usize,
    i2: usize,
    out: &mut DistanceVector3,
) -> usize {
    let [a_x, a_y, a_z] = simplex.simplex[i0];
    let [b_x, b_y, b_z] = simplex.simplex[i1];
    let [c_x, c_y, c_z] = simplex.simplex[i2];
    let ab_x = b_x - a_x;
    let ab_y = b_y - a_y;
    let ab_z = b_z - a_z;
    let ac_x = c_x - a_x;
    let ac_y = c_y - a_y;
    let ac_z = c_z - a_z;

    let d1 = ab_x * -a_x + ab_y * -a_y + ab_z * -a_z;
    let d2 = ac_x * -a_x + ac_y * -a_y + ac_z * -a_z;
    if d1 <= 0.0 && d2 <= 0.0 {
        return write_collision_distance_triangle_vertex3d(simplex, a_x, a_y, a_z, i0, out);
    }
    let d3 = ab_x * -b_x + ab_y * -b_y + ab_z * -b_z;
    let d4 = ac_x * -b_x + ac_y * -b_y + ac_z * -b_z;
    if d3 >= 0.0 && d4 <= d3 {
        return write_collision_distance_triangle_vertex3d(simplex, b_x, b_y, b_z, i1, out);
    }
    let d5 = ab_x * -c_x + ab_y * -c_y + ab_z * -c_z;
    let d6 = ac_x * -c_x + ac_y * -c_y + ac_z * -c_z;
    if d6 >= 0.0 && d5 <= d6 {
        return write_collision_distance_triangle_vertex3d(simplex, c_x, c_y, c_z, i2, out);
    }

    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let t = d1 / (d1 - d3);
        return write_collision_distance_triangle_edge3d(
            simplex, a_x, a_y, a_z, ab_x, ab_y, ab_z, t, i0, i1, out,
        );
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let t = d2 / (d2 - d6);
        return write_collision_distance_triangle_edge3d(
            simplex, a_x, a_y, a_z, ac_x, ac_y, ac_z, t, i0, i2, out,
        );
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0 {
        let t = (d4 - d3) / (d4 - d3 + (d5 - d6));
        return write_collision_distance_triangle_edge3d(
            simplex,
            b_x,
            b_y,
            b_z,
            c_x - b_x,
            c_y - b_y,
            c_z - b_z,
            t,
            i1,
            i2,
            out,
        );
    }

    let denominator = va + vb + vc;
    if !(denominator > 0.0) {
        return write_collision_distance_triangle_vertex3d(simplex, a_x, a_y, a_z, i0, out);
    }
    let v = vb / denominator;
    let w = vc / denominator;
    *out = [
        a_x + ab_x * v + ac_x * w,
        a_y + ab_y * v + ac_y * w,
        a_z + ab_z * v + ac_z * w,
    ];
    return write_collision_distance_reduction3d(simplex, 3, i0, i1, i2, 1.0 - v - w, v, w);
}

// flight-lint: allow(f64) measured crossing-capsule failure requires private simplex arithmetic before narrowing final public f32 results
// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn write_collision_distance3d(
    out: &mut CollisionDistance3D,
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    offset_x: Option<f32>,
    offset_y: Option<f32>,
    offset_z: Option<f32>,
) -> bool {
    initialize_collision_distance3d(out);
    let offset_x = offset_x.unwrap_or(0.0) as f64;
    let offset_y = offset_y.unwrap_or(0.0) as f64;
    let offset_z = offset_z.unwrap_or(0.0) as f64;
    let Some(support_a) = get_collision_support3d(registry, get_collision_shape3d_kind_key(a))
    else {
        return false;
    };
    let Some(support_b) = get_collision_support3d(registry, get_collision_shape3d_kind_key(b))
    else {
        return false;
    };

    let mut scratch_support_a = [0.0_f32; 3];
    let mut scratch_support_b = [0.0_f32; 3];
    support_a(a, 1.0, 0.0, 0.0, &mut scratch_support_a);
    support_b(b, -1.0, 0.0, 0.0, &mut scratch_support_b);
    let mut simplex = create_collision_distance_simplex3d();
    write_collision_distance_simplex_vertex3d(
        &mut simplex,
        0,
        scratch_support_a,
        scratch_support_b,
        offset_x,
        offset_y,
        offset_z,
    );
    let mut count = 1;
    let mut closest_x = simplex.simplex[0][0];
    let mut closest_y = simplex.simplex[0][1];
    let mut closest_z = simplex.simplex[0][2];

    for _ in 0..MAX_DISTANCE_ITERATIONS {
        let closest_length_squared =
            closest_x * closest_x + closest_y * closest_y + closest_z * closest_z;
        if closest_length_squared <= DISTANCE_EPSILON * DISTANCE_EPSILON {
            out.overlapping = true;
            return false;
        }

        support_a(
            a,
            -closest_x as f32,
            -closest_y as f32,
            -closest_z as f32,
            &mut scratch_support_a,
        );
        support_b(
            b,
            closest_x as f32,
            closest_y as f32,
            closest_z as f32,
            &mut scratch_support_b,
        );
        let next_x = scratch_support_a[0] as f64 + offset_x - scratch_support_b[0] as f64;
        let next_y = scratch_support_a[1] as f64 + offset_y - scratch_support_b[1] as f64;
        let next_z = scratch_support_a[2] as f64 + offset_z - scratch_support_b[2] as f64;
        let progress =
            closest_length_squared - (next_x * closest_x + next_y * closest_y + next_z * closest_z);
        if progress <= DISTANCE_TOLERANCE * closest_length_squared {
            break;
        }
        if contains_collision_distance_simplex_point3d(&simplex, count, next_x, next_y, next_z) {
            break;
        }

        write_collision_distance_simplex_vertex3d(
            &mut simplex,
            count,
            scratch_support_a,
            scratch_support_b,
            offset_x,
            offset_y,
            offset_z,
        );
        count += 1;
        let mut closest = [0.0_f64; 3];
        if reduce_collision_distance_simplex3d(&mut simplex, count, &mut closest) == 4 {
            out.overlapping = true;
            return false;
        }
        compact_collision_distance_simplex3d(&mut simplex);
        count = simplex.reduced_count;
        closest_x = closest[0];
        closest_y = closest[1];
        closest_z = closest[2];
    }

    let distance = (closest_x * closest_x + closest_y * closest_y + closest_z * closest_z).sqrt();
    if !(distance > 0.0) {
        out.overlapping = true;
        return false;
    }
    out.distance = distance as f32;
    out.direction_x = (closest_x / distance) as f32;
    out.direction_y = (closest_y / distance) as f32;
    out.direction_z = (closest_z / distance) as f32;
    write_collision_distance_witness_points3d(&simplex, out);
    return true;
}

// flight-lint: allow(f64) records the measured private simplex reduction indices and barycentric weights
#[allow(clippy::too_many_arguments)]
fn write_collision_distance_reduction3d(
    simplex: &mut CollisionDistanceSimplex3D,
    count: usize,
    i0: usize,
    i1: usize,
    i2: usize,
    w0: f64,
    w1: f64,
    w2: f64,
) -> usize {
    simplex.reduced_count = count;
    simplex.reduced_indices = [i0, i1, i2];
    simplex.reduced_weights = [w0, w1, w2];
    return count;
}

// flight-lint: allow(f64) promotes canonical f32 supports losslessly into the measured private simplex scratch
#[allow(clippy::too_many_arguments)]
fn write_collision_distance_simplex_vertex3d(
    simplex: &mut CollisionDistanceSimplex3D,
    slot: usize,
    support_a: [f32; 3],
    support_b: [f32; 3],
    offset_x: f64,
    offset_y: f64,
    offset_z: f64,
) {
    simplex.simplex_a[slot] = [
        support_a[0] as f64 + offset_x,
        support_a[1] as f64 + offset_y,
        support_a[2] as f64 + offset_z,
    ];
    simplex.simplex_b[slot] = [
        support_b[0] as f64,
        support_b[1] as f64,
        support_b[2] as f64,
    ];
    simplex.simplex[slot] = [
        simplex.simplex_a[slot][0] - support_b[0] as f64,
        simplex.simplex_a[slot][1] - support_b[1] as f64,
        simplex.simplex_a[slot][2] - support_b[2] as f64,
    ];
}

// flight-lint: allow(f64) writes an edge-owned result in the measured private simplex reduction domain
#[allow(clippy::too_many_arguments)]
fn write_collision_distance_triangle_edge3d(
    simplex: &mut CollisionDistanceSimplex3D,
    origin_x: f64,
    origin_y: f64,
    origin_z: f64,
    edge_x: f64,
    edge_y: f64,
    edge_z: f64,
    t: f64,
    keep_first: usize,
    keep_second: usize,
    out: &mut DistanceVector3,
) -> usize {
    *out = [
        origin_x + edge_x * t,
        origin_y + edge_y * t,
        origin_z + edge_z * t,
    ];
    return write_collision_distance_reduction3d(
        simplex,
        2,
        keep_first,
        keep_second,
        0,
        1.0 - t,
        t,
        0.0,
    );
}

// flight-lint: allow(f64) writes a vertex-owned result in the measured private simplex reduction domain
fn write_collision_distance_triangle_vertex3d(
    simplex: &mut CollisionDistanceSimplex3D,
    x: f64,
    y: f64,
    z: f64,
    keep: usize,
    out: &mut DistanceVector3,
) -> usize {
    *out = [x, y, z];
    return write_collision_distance_reduction3d(simplex, 1, keep, 0, 0, 1.0, 0.0, 0.0);
}

// flight-lint: allow(f64) accumulates measured private barycentric witnesses before narrowing final public f32 fields
fn write_collision_distance_witness_points3d(
    simplex: &CollisionDistanceSimplex3D,
    out: &mut CollisionDistance3D,
) {
    let mut point_a_x = 0.0_f64;
    let mut point_a_y = 0.0_f64;
    let mut point_a_z = 0.0_f64;
    let mut point_b_x = 0.0_f64;
    let mut point_b_y = 0.0_f64;
    let mut point_b_z = 0.0_f64;
    for slot in 0..simplex.reduced_count {
        let weight = simplex.reduced_weights[slot];
        point_a_x += simplex.simplex_a[slot][0] * weight;
        point_a_y += simplex.simplex_a[slot][1] * weight;
        point_a_z += simplex.simplex_a[slot][2] * weight;
        point_b_x += simplex.simplex_b[slot][0] * weight;
        point_b_y += simplex.simplex_b[slot][1] * weight;
        point_b_z += simplex.simplex_b[slot][2] * weight;
    }
    out.point_a_x = point_a_x as f32;
    out.point_a_y = point_a_y as f32;
    out.point_a_z = point_a_z as f32;
    out.point_b_x = point_b_x as f32;
    out.point_b_y = point_b_y as f32;
    out.point_b_z = point_b_z as f32;
}
