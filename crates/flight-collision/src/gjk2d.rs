use crate::collision_support2d::*;
use crate::manifold2d::*;
use crate::types::*;

const MAX_GJK_ITERATIONS: usize = 32;
const MAX_EPA_ITERATIONS: usize = 32;
const MAX_POLYTOPE_VERTICES: usize = 40;
const EPA_TOLERANCE: f32 = 1e-9;
const EPSILON: f32 = 1e-12;
const AXIS_EPSILON: f32 = 1e-9;
const TIE_TOLERANCE: f32 = 1e-6;

fn ensure_ccw(px: &mut [f32], py: &mut [f32], count: usize) {
    let mut area = 0.0_f32;
    for i in 0..count {
        let j = (i + 1) % count;
        area += px[i] * py[j] - px[j] * py[i];
    }
    if area < 0.0 {
        for i in 0..count / 2 {
            let j = count - 1 - i;
            let tmp_x = px[i];
            let tmp_y = py[i];
            px[i] = px[j];
            py[i] = py[j];
            px[j] = tmp_x;
            py[j] = tmp_y;
        }
    }
}

fn process_line_simplex(
    simplex: &[[f32; 2]; 3],
    count: &mut usize,
) -> (bool, f32, f32) {
    let ax = simplex[1][0];
    let ay = simplex[1][1];
    let bx = simplex[0][0];
    let by = simplex[0][1];
    let abx = bx - ax;
    let aby = by - ay;
    let ao_x = -ax;
    let ao_y = -ay;

    let dot = abx * ao_x + aby * ao_y;
    if dot > 0.0 {
        let perp_x = abx * ao_y - aby * ao_x;
        let dir_x = -aby * perp_x;
        let dir_y = abx * perp_x;
        *count = 2;
        return (false, dir_x, dir_y);
    }

    *count = 1;
    return (false, ao_x, ao_y);
}

fn process_triangle_simplex(
    simplex: &[[f32; 2]; 3],
) -> (bool, f32, f32, usize, [[f32; 2]; 3]) {
    let ax = simplex[2][0];
    let ay = simplex[2][1];
    let bx = simplex[1][0];
    let by = simplex[1][1];
    let cx = simplex[0][0];
    let cy = simplex[0][1];

    let abx = bx - ax;
    let aby = by - ay;
    let acx = cx - ax;
    let acy = cy - ay;
    let ao_x = -ax;
    let ao_y = -ay;

    let ab_perp_x = -(abx * acy - aby * acx) * acy;
    let ab_perp_y = (abx * acy - aby * acx) * acx;
    let ac_perp_x = (acx * aby - acy * abx) * aby;
    let ac_perp_y = -(acx * aby - acy * abx) * abx;

    let ab_dot = ab_perp_x * ao_x + ab_perp_y * ao_y;
    let ac_dot = ac_perp_x * ao_x + ac_perp_y * ao_y;

    let mut new_simplex = *simplex;

    if ab_dot > 0.0 {
        new_simplex[0] = simplex[1];
        new_simplex[1] = simplex[2];
        return (false, ab_perp_x, ab_perp_y, 2, new_simplex);
    }
    if ac_dot > 0.0 {
        new_simplex[0] = simplex[0];
        new_simplex[1] = simplex[2];
        return (false, ac_perp_x, ac_perp_y, 2, new_simplex);
    }

    return (true, 0.0, 0.0, 3, new_simplex);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision_support2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionManifold2D,
) -> bool {
    clear_collision_manifold2d(out);

    let mut support_a = [0.0_f32; 2];
    let mut support_b = [0.0_f32; 2];
    if !write_collision_support2d(registry, a, 1.0, 0.0, &mut support_a) {
        return false;
    }
    if !write_collision_support2d(registry, b, -1.0, 0.0, &mut support_b) {
        return false;
    }

    let mut simplex = [[0.0_f32; 2]; 3];
    simplex[0][0] = support_a[0] - support_b[0];
    simplex[0][1] = support_a[1] - support_b[1];
    let mut simplex_count = 1_usize;

    let mut dir_x = -simplex[0][0];
    let mut dir_y = -simplex[0][1];
    if dir_x * dir_x + dir_y * dir_y < EPSILON * EPSILON {
        dir_x = 1.0;
        dir_y = 0.0;
    }

    for _iteration in 0..MAX_GJK_ITERATIONS {
        if !write_collision_support2d(registry, a, dir_x, dir_y, &mut support_a) {
            return false;
        }
        if !write_collision_support2d(registry, b, -dir_x, -dir_y, &mut support_b) {
            return false;
        }
        let new_x = support_a[0] - support_b[0];
        let new_y = support_a[1] - support_b[1];

        if new_x * dir_x + new_y * dir_y < 0.0 {
            return false;
        }

        simplex[simplex_count][0] = new_x;
        simplex[simplex_count][1] = new_y;
        simplex_count += 1;

        if simplex_count == 2 {
            let (contains, new_dx, new_dy) = process_line_simplex(&simplex, &mut simplex_count);
            if contains {
                return write_epa2d_penetration(registry, a, b, &simplex, simplex_count, out);
            }
            dir_x = new_dx;
            dir_y = new_dy;
        } else if simplex_count == 3 {
            let (contains, new_dx, new_dy, new_count, new_simplex) =
                process_triangle_simplex(&simplex);
            simplex_count = new_count;
            if new_count <= 3 {
                for i in 0..new_count {
                    simplex[i] = new_simplex[i];
                }
            }
            if contains {
                return write_epa2d_penetration(registry, a, b, &simplex, simplex_count, out);
            }
            dir_x = new_dx;
            dir_y = new_dy;
        }
    }

    return false;
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision_support_overlap2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
) -> bool {
    let mut out = create_collision_manifold2d();
    return test_collision_support2d(registry, a, b, &mut out);
}

fn write_collision_support2d(
    registry: &CollisionRegistry2D,
    shape: &CollisionShape2D,
    direction_x: f32,
    direction_y: f32,
    out: &mut [f32; 2],
) -> bool {
    let kind = get_collision_shape2d_kind_key(shape);
    let Some(support) = get_collision_support2d(registry, kind) else {
        return false;
    };
    support(shape, direction_x, direction_y, out);
    return true;
}

fn write_epa2d_penetration(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    simplex: &[[f32; 2]; 3],
    simplex_count: usize,
    out: &mut CollisionManifold2D,
) -> bool {
    let mut polytope_x = [0.0_f32; MAX_POLYTOPE_VERTICES];
    let mut polytope_y = [0.0_f32; MAX_POLYTOPE_VERTICES];
    let mut polytope_count = simplex_count;

    for i in 0..simplex_count {
        polytope_x[i] = simplex[i][0];
        polytope_y[i] = simplex[i][1];
    }

    if polytope_count < 3 {
        out.overlapping = true;
        out.normal_x = 1.0;
        out.normal_y = 0.0;
        out.depth = 0.0;
        return true;
    }

    ensure_ccw(&mut polytope_x, &mut polytope_y, polytope_count);

    let mut support_a = [0.0_f32; 2];
    let mut support_b = [0.0_f32; 2];

    for _iteration in 0..MAX_EPA_ITERATIONS {
        let mut min_dist = f32::INFINITY;
        let mut min_index = 0_usize;
        let mut min_normal_x = 0.0_f32;
        let mut min_normal_y = 0.0_f32;

        for i in 0..polytope_count {
            let j = (i + 1) % polytope_count;
            let ex = polytope_x[j] - polytope_x[i];
            let ey = polytope_y[j] - polytope_y[i];
            let mut nx = ey;
            let mut ny = -ex;
            let len = (nx * nx + ny * ny).sqrt();
            if len <= EPSILON {
                continue;
            }
            nx /= len;
            ny /= len;
            let dist = polytope_x[i] * nx + polytope_y[i] * ny;
            if dist < min_dist {
                min_dist = dist;
                min_index = i;
                min_normal_x = nx;
                min_normal_y = ny;
            }
        }

        if !write_collision_support2d(
            registry,
            a,
            min_normal_x,
            min_normal_y,
            &mut support_a,
        ) {
            break;
        }
        if !write_collision_support2d(
            registry,
            b,
            -min_normal_x,
            -min_normal_y,
            &mut support_b,
        ) {
            break;
        }
        let sx = support_a[0] - support_b[0];
        let sy = support_a[1] - support_b[1];
        let support_dist = sx * min_normal_x + sy * min_normal_y;

        if support_dist - min_dist < EPA_TOLERANCE {
            let len = (min_normal_x * min_normal_x + min_normal_y * min_normal_y).sqrt();
            if len > AXIS_EPSILON {
                out.overlapping = true;
                out.normal_x = min_normal_x / len;
                out.normal_y = min_normal_y / len;
                out.depth = min_dist / len;
                if out.depth < 0.0 {
                    out.depth = -out.depth;
                    out.normal_x = -out.normal_x;
                    out.normal_y = -out.normal_y;
                }
                return true;
            }
            break;
        }

        if polytope_count >= MAX_POLYTOPE_VERTICES {
            break;
        }

        let insert_at = (min_index + 1) % polytope_count;
        for i in (insert_at..polytope_count).rev() {
            polytope_x[i + 1] = polytope_x[i];
            polytope_y[i + 1] = polytope_y[i];
        }
        polytope_x[insert_at] = sx;
        polytope_y[insert_at] = sy;
        polytope_count += 1;
    }

    out.overlapping = true;
    out.normal_x = 1.0;
    out.normal_y = 0.0;
    out.depth = 0.0;
    return true;
}
