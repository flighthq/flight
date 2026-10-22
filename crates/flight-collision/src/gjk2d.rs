// flight-lint: allow-file(f64) source-number GJK2D/EPA scratch is required by the restored seeded differential corpus; public supports and manifolds remain f32
use crate::collision_support2d::*;
use crate::manifold2d::*;
use crate::types::*;

const MAX_GJK_ITERATIONS: usize = 32;
const MAX_EPA_ITERATIONS: usize = 32;
const MAX_POLYTOPE_VERTICES: usize = 40;
const EPA_TOLERANCE: f64 = 1e-9;
const EPSILON: f64 = 1e-12;
const AXIS_EPSILON: f64 = 1e-9;
const TIE_TOLERANCE: f64 = 1e-6;
const INTERIOR_AXES: [f64; 8] = [1.0, 0.0, -1.0, 0.0, 0.0, 1.0, 0.0, -1.0];

// flight-lint: allow(fn-order) the EPA tie-break helper stays adjacent to the source-ordered EPA implementation it supports
fn is_preferred_epa_axis(
    distance: f64,
    axis_x: f64,
    axis_y: f64,
    best_distance: f64,
    best_axis_x: f64,
    best_axis_y: f64,
) -> bool {
    if distance < best_distance - AXIS_EPSILON {
        return true;
    }
    if (distance - best_distance).abs() > AXIS_EPSILON {
        return false;
    }
    if axis_x > best_axis_x + AXIS_EPSILON {
        return true;
    }
    return (axis_x - best_axis_x).abs() <= AXIS_EPSILON && axis_y > best_axis_y;
}

// flight-lint: allow(fn-order) the source-ordered GJK implementation follows its EPA and interior helpers
fn run_gjk2d(
    a: &CollisionShape2D,
    support_a: &CollisionSupport2D,
    b: &CollisionShape2D,
    support_b: &CollisionSupport2D,
    simplex: &mut [f64; 6],
) -> bool {
    let mut minkowski = [0.0_f64; 2];
    write_minkowski_support2d(a, support_a, b, support_b, 1.0, 0.0, &mut minkowski);
    simplex[0] = minkowski[0];
    simplex[1] = minkowski[1];
    let mut count = 1_usize;
    let mut direction_x = -simplex[0];
    let mut direction_y = -simplex[1];

    for _ in 0..MAX_GJK_ITERATIONS {
        if direction_x == 0.0 && direction_y == 0.0 {
            return false;
        }
        write_minkowski_support2d(
            a,
            support_a,
            b,
            support_b,
            direction_x,
            direction_y,
            &mut minkowski,
        );
        if minkowski[0] * direction_x + minkowski[1] * direction_y <= 0.0 {
            return false;
        }

        simplex[count * 2] = minkowski[0];
        simplex[count * 2 + 1] = minkowski[1];
        count += 1;

        if count == 2 {
            let bx = simplex[0];
            let by = simplex[1];
            let ax = simplex[2];
            let ay = simplex[3];
            let edge_x = bx - ax;
            let edge_y = by - ay;
            let cross = edge_x * -ay - edge_y * -ax;
            if cross == 0.0 {
                direction_x = -edge_y;
                direction_y = edge_x;
            } else {
                direction_x = -edge_y * cross;
                direction_y = edge_x * cross;
            }
            continue;
        }

        let cx = simplex[0];
        let cy = simplex[1];
        let bx = simplex[2];
        let by = simplex[3];
        let ax = simplex[4];
        let ay = simplex[5];
        let ab_x = bx - ax;
        let ab_y = by - ay;
        let ac_x = cx - ax;
        let ac_y = cy - ay;
        let ab_dot_ac = ab_x * ac_x + ab_y * ac_y;
        let ab_length_squared = ab_x * ab_x + ab_y * ab_y;
        let ac_length_squared = ac_x * ac_x + ac_y * ac_y;

        let ab_normal_x = ab_x * ab_dot_ac - ac_x * ab_length_squared;
        let ab_normal_y = ab_y * ab_dot_ac - ac_y * ab_length_squared;
        if ab_normal_x * -ax + ab_normal_y * -ay > 0.0 {
            simplex[0] = bx;
            simplex[1] = by;
            simplex[2] = ax;
            simplex[3] = ay;
            count = 2;
            direction_x = ab_normal_x;
            direction_y = ab_normal_y;
            continue;
        }

        let ac_normal_x = ac_x * ab_dot_ac - ab_x * ac_length_squared;
        let ac_normal_y = ac_y * ab_dot_ac - ab_y * ac_length_squared;
        if ac_normal_x * -ax + ac_normal_y * -ay > 0.0 {
            simplex[2] = ax;
            simplex[3] = ay;
            count = 2;
            direction_x = ac_normal_x;
            direction_y = ac_normal_y;
            continue;
        }
        return true;
    }
    return false;
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision_support2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionManifold2D,
) -> bool {
    clear_collision_manifold2d(out);
    let Some(support_a) = get_collision_support2d(registry, get_collision_shape2d_kind_key(a))
    else {
        return false;
    };
    let Some(support_b) = get_collision_support2d(registry, get_collision_shape2d_kind_key(b))
    else {
        return false;
    };

    let mut simplex = [0.0_f64; 6];
    if !run_gjk2d(a, support_a, b, support_b, &mut simplex) {
        return false;
    }
    return write_epa2d_penetration(a, support_a, b, support_b, &simplex, out);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision_support_overlap2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
) -> bool {
    let Some(support_a) = get_collision_support2d(registry, get_collision_shape2d_kind_key(a))
    else {
        return false;
    };
    let Some(support_b) = get_collision_support2d(registry, get_collision_shape2d_kind_key(b))
    else {
        return false;
    };
    let mut simplex = [0.0_f64; 6];
    return run_gjk2d(a, support_a, b, support_b, &mut simplex);
}

fn write_epa2d_penetration(
    a: &CollisionShape2D,
    support_a: &CollisionSupport2D,
    b: &CollisionShape2D,
    support_b: &CollisionSupport2D,
    simplex: &[f64; 6],
    out: &mut CollisionManifold2D,
) -> bool {
    let mut count = 3_usize;
    let mut polytope = [0.0_f64; MAX_POLYTOPE_VERTICES * 2 + 2];
    polytope[..6].copy_from_slice(simplex);

    // Keep the best edge outside the loop so exhausting the iteration budget returns the best
    // boundary found. GJK already established overlap; only a polytope with no edge is a failure.
    let mut best_distance = f64::INFINITY;
    let mut best_axis_x = 0.0_f64;
    let mut best_axis_y = 0.0_f64;
    let mut best_normal_x = 0.0_f64;
    let mut best_normal_y = 0.0_f64;
    let mut found = false;
    let mut previous_distance = f64::NEG_INFINITY;
    let mut previous_axis_x = 0.0_f64;
    let mut previous_axis_y = 0.0_f64;
    let mut previous_normal_x = 0.0_f64;
    let mut previous_normal_y = 0.0_f64;
    let mut minkowski = [0.0_f64; 2];

    for _ in 0..MAX_EPA_ITERATIONS {
        let mut best_edge = None;
        let mut search_normal_x = 0.0_f64;
        let mut search_normal_y = 0.0_f64;
        best_distance = f64::INFINITY;

        for i in 0..count {
            let j = (i + 1) % count;
            let ax = polytope[i * 2];
            let ay = polytope[i * 2 + 1];
            let edge_x = polytope[j * 2] - ax;
            let edge_y = polytope[j * 2 + 1] - ay;
            let mut normal_x = edge_y;
            let mut normal_y = -edge_x;
            let length = (normal_x * normal_x + normal_y * normal_y).sqrt();
            if length <= EPSILON {
                continue;
            }
            normal_x /= length;
            normal_y /= length;
            let mut distance = ax * normal_x + ay * normal_y;
            if distance < 0.0 {
                normal_x = -normal_x;
                normal_y = -normal_y;
                distance = -distance;
            }

            let mut axis_x = normal_x;
            let mut axis_y = normal_y;
            if axis_x < -AXIS_EPSILON || (axis_x.abs() <= AXIS_EPSILON && axis_y < 0.0) {
                axis_x = -axis_x;
                axis_y = -axis_y;
            }
            if !found
                || is_preferred_epa_axis(
                    distance,
                    axis_x,
                    axis_y,
                    best_distance,
                    best_axis_x,
                    best_axis_y,
                )
            {
                best_distance = distance;
                best_axis_x = axis_x;
                best_axis_y = axis_y;
                best_normal_x = normal_x;
                best_normal_y = normal_y;
                search_normal_x = normal_x;
                search_normal_y = normal_y;
                best_edge = Some(j);
                found = true;
            }
        }
        let Some(best_edge) = best_edge else {
            break;
        };

        // Expanding a convex polytope cannot move its closest boundary toward the origin. Public
        // f32 support points can nevertheless introduce a sub-ulp non-convexity once the private f64
        // EPA scratch has converged beyond their precision. Stop at the last valid boundary instead
        // of exhausting the iteration budget and returning a later regressed edge.
        if previous_distance.is_finite() && best_distance < previous_distance - EPA_TOLERANCE {
            best_distance = previous_distance;
            best_axis_x = previous_axis_x;
            best_axis_y = previous_axis_y;
            best_normal_x = previous_normal_x;
            best_normal_y = previous_normal_y;
            break;
        }
        previous_distance = best_distance;
        previous_axis_x = best_axis_x;
        previous_axis_y = best_axis_y;
        previous_normal_x = best_normal_x;
        previous_normal_y = best_normal_y;

        write_minkowski_support2d(
            a,
            support_a,
            b,
            support_b,
            search_normal_x,
            search_normal_y,
            &mut minkowski,
        );
        let reach = minkowski[0] * search_normal_x + minkowski[1] * search_normal_y;
        if reach - best_distance <= EPA_TOLERANCE || count + 1 >= MAX_POLYTOPE_VERTICES {
            break;
        }

        for i in (best_edge..count).rev() {
            polytope[(i + 1) * 2] = polytope[i * 2];
            polytope[(i + 1) * 2 + 1] = polytope[i * 2 + 1];
        }
        polytope[best_edge * 2] = minkowski[0];
        polytope[best_edge * 2 + 1] = minkowski[1];
        count += 1;
    }

    if !found {
        return false;
    }

    write_minkowski_support2d(
        a,
        support_a,
        b,
        support_b,
        -best_normal_x,
        -best_normal_y,
        &mut minkowski,
    );
    let opposite = -(minkowski[0] * best_normal_x + minkowski[1] * best_normal_y);
    let mut normal_x = best_normal_x;
    let mut normal_y = best_normal_y;
    if (opposite - best_distance).abs() <= TIE_TOLERANCE {
        let mut interior = [0.0_f64; 2];
        write_minkowski_interior2d(a, support_a, b, support_b, &mut interior);
        if best_axis_x * interior[0] + best_axis_y * interior[1] < 0.0 {
            normal_x = -best_axis_x;
            normal_y = -best_axis_y;
        } else {
            normal_x = best_axis_x;
            normal_y = best_axis_y;
        }
        normal_x = -normal_x;
        normal_y = -normal_y;
    }

    out.overlapping = true;
    out.normal_x = (-normal_x) as f32;
    out.normal_y = (-normal_y) as f32;
    out.depth = best_distance as f32;
    return true;
}

fn write_minkowski_interior2d(
    a: &CollisionShape2D,
    support_a: &CollisionSupport2D,
    b: &CollisionShape2D,
    support_b: &CollisionSupport2D,
    out: &mut [f64; 2],
) {
    out[0] = 0.0;
    out[1] = 0.0;
    let mut minkowski = [0.0_f64; 2];
    for i in 0..4 {
        write_minkowski_support2d(
            a,
            support_a,
            b,
            support_b,
            INTERIOR_AXES[i * 2],
            INTERIOR_AXES[i * 2 + 1],
            &mut minkowski,
        );
        out[0] += minkowski[0];
        out[1] += minkowski[1];
    }
    out[0] /= 4.0;
    out[1] /= 4.0;
}

fn write_minkowski_support2d(
    a: &CollisionShape2D,
    support_a: &CollisionSupport2D,
    b: &CollisionShape2D,
    support_b: &CollisionSupport2D,
    direction_x: f64,
    direction_y: f64,
    out: &mut [f64; 2],
) {
    let mut support_point_a = [0.0_f32; 2];
    let mut support_point_b = [0.0_f32; 2];
    support_a(
        a,
        direction_x as f32,
        direction_y as f32,
        &mut support_point_a,
    );
    support_b(
        b,
        -direction_x as f32,
        -direction_y as f32,
        &mut support_point_b,
    );
    out[0] = f64::from(support_point_a[0]) - f64::from(support_point_b[0]);
    out[1] = f64::from(support_point_a[1]) - f64::from(support_point_b[1]);
}
