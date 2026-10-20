use crate::collision_support3d::*;
use crate::manifold3d::*;
use crate::types::*;

const MAX_GJK_ITERATIONS: usize = 64;
const MAX_EPA_ITERATIONS: usize = 64;
const MAX_POLYTOPE_VERTICES: usize = 64;
const MAX_EPA_FACES: usize = 128;
const MAX_EPA_HORIZON_EDGES: usize = 128;
const EPA_TOLERANCE: f64 = 1e-9;
const EPSILON: f64 = 1e-12;
const AXIS_EPSILON: f64 = 1e-9;

pub fn test_collision_support3d(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    clear_collision_manifold3d(out);

    let mut support_a = [0.0_f64; 3];
    let mut support_b = [0.0_f64; 3];
    if !get_collision_support3d(a, 1.0, 0.0, 0.0, &mut support_a) {
        return false;
    }
    if !get_collision_support3d(b, -1.0, 0.0, 0.0, &mut support_b) {
        return false;
    }

    let mut simplex = [[0.0_f64; 3]; 4];
    simplex[0] = [
        support_a[0] - support_b[0],
        support_a[1] - support_b[1],
        support_a[2] - support_b[2],
    ];
    let mut simplex_count = 1_usize;

    let mut dir = [
        -simplex[0][0],
        -simplex[0][1],
        -simplex[0][2],
    ];
    let dir_len = (dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]).sqrt();
    if dir_len < EPSILON {
        dir = [1.0, 0.0, 0.0];
    }

    for _iteration in 0..MAX_GJK_ITERATIONS {
        if !get_collision_support3d(a, dir[0], dir[1], dir[2], &mut support_a) {
            return false;
        }
        if !get_collision_support3d(b, -dir[0], -dir[1], -dir[2], &mut support_b) {
            return false;
        }
        let new_point = [
            support_a[0] - support_b[0],
            support_a[1] - support_b[1],
            support_a[2] - support_b[2],
        ];

        let dot = new_point[0] * dir[0] + new_point[1] * dir[1] + new_point[2] * dir[2];
        if dot < 0.0 {
            return false;
        }

        simplex[simplex_count] = new_point;
        simplex_count += 1;

        let result = do_simplex3d(&mut simplex, &mut simplex_count, &mut dir);
        if result {
            return write_epa3d_penetration(a, b, &simplex, simplex_count, out);
        }
    }

    return false;
}

pub fn test_collision_support_overlap3d(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
) -> bool {
    let mut out = create_collision_manifold3d();
    return test_collision_support3d(a, b, &mut out);
}

fn do_simplex3d(
    simplex: &mut [[f64; 3]; 4],
    count: &mut usize,
    dir: &mut [f64; 3],
) -> bool {
    match *count {
        2 => do_simplex_line3d(simplex, count, dir),
        3 => do_simplex_triangle3d(simplex, count, dir),
        4 => do_simplex_tetrahedron3d(simplex, count, dir),
        _ => false,
    }
}

fn do_simplex_line3d(
    simplex: &mut [[f64; 3]; 4],
    count: &mut usize,
    dir: &mut [f64; 3],
) -> bool {
    let a = simplex[1];
    let b = simplex[0];
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ao = [-a[0], -a[1], -a[2]];

    let dot = ab[0] * ao[0] + ab[1] * ao[1] + ab[2] * ao[2];
    if dot > 0.0 {
        let cross = [
            ab[1] * ao[2] - ab[2] * ao[1],
            ab[2] * ao[0] - ab[0] * ao[2],
            ab[0] * ao[1] - ab[1] * ao[0],
        ];
        dir[0] = cross[1] * ab[2] - cross[2] * ab[1];
        dir[1] = cross[2] * ab[0] - cross[0] * ab[2];
        dir[2] = cross[0] * ab[1] - cross[1] * ab[0];
        *count = 2;
    } else {
        simplex[0] = a;
        *count = 1;
        *dir = ao;
    }
    return false;
}

fn do_simplex_triangle3d(
    simplex: &mut [[f64; 3]; 4],
    count: &mut usize,
    dir: &mut [f64; 3],
) -> bool {
    let a = simplex[2];
    let b = simplex[1];
    let c = simplex[0];
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let ao = [-a[0], -a[1], -a[2]];

    let abc = cross3(&ab, &ac);
    let ab_perp = cross3(&ab, &abc);
    let ac_perp = cross3(&abc, &ac);

    if dot3(&ac_perp, &ao) > 0.0 {
        if dot3(&ac, &ao) > 0.0 {
            simplex[0] = c;
            simplex[1] = a;
            *count = 2;
            *dir = triple_cross(&ac, &ao, &ac);
        } else {
            simplex[0] = b;
            simplex[1] = a;
            *count = 2;
            return do_simplex_line3d(simplex, count, dir);
        }
    } else if dot3(&ab_perp, &ao) > 0.0 {
        simplex[0] = b;
        simplex[1] = a;
        *count = 2;
        return do_simplex_line3d(simplex, count, dir);
    } else {
        if dot3(&abc, &ao) > 0.0 {
            *dir = abc;
        } else {
            let temp = simplex[0];
            simplex[0] = simplex[1];
            simplex[1] = temp;
            dir[0] = -abc[0];
            dir[1] = -abc[1];
            dir[2] = -abc[2];
        }
    }
    return false;
}

fn do_simplex_tetrahedron3d(
    simplex: &mut [[f64; 3]; 4],
    count: &mut usize,
    dir: &mut [f64; 3],
) -> bool {
    let a = simplex[3];
    let b = simplex[2];
    let c = simplex[1];
    let d = simplex[0];
    let ab = sub3(&b, &a);
    let ac = sub3(&c, &a);
    let ad = sub3(&d, &a);
    let ao = [-a[0], -a[1], -a[2]];

    let abc = cross3(&ab, &ac);
    let acd = cross3(&ac, &ad);
    let adb = cross3(&ad, &ab);

    if dot3(&abc, &ao) > 0.0 {
        simplex[0] = c;
        simplex[1] = b;
        simplex[2] = a;
        *count = 3;
        *dir = abc;
        return do_simplex_triangle3d(simplex, count, dir);
    }
    if dot3(&acd, &ao) > 0.0 {
        simplex[0] = d;
        simplex[1] = c;
        simplex[2] = a;
        *count = 3;
        *dir = acd;
        return do_simplex_triangle3d(simplex, count, dir);
    }
    if dot3(&adb, &ao) > 0.0 {
        simplex[0] = b;
        simplex[1] = d;
        simplex[2] = a;
        *count = 3;
        *dir = adb;
        return do_simplex_triangle3d(simplex, count, dir);
    }
    return true;
}

fn write_epa3d_penetration(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    simplex: &[[f64; 3]; 4],
    simplex_count: usize,
    out: &mut CollisionManifold3D,
) -> bool {
    if simplex_count < 4 {
        out.overlapping = true;
        out.normal_x = 1.0;
        out.normal_y = 0.0;
        out.normal_z = 0.0;
        out.depth = 0.0;
        return true;
    }

    let mut polytope = Vec::with_capacity(MAX_POLYTOPE_VERTICES * 3);
    for i in 0..simplex_count {
        polytope.push(simplex[i][0]);
        polytope.push(simplex[i][1]);
        polytope.push(simplex[i][2]);
    }

    let mut faces: Vec<[usize; 3]> = Vec::with_capacity(MAX_EPA_FACES);
    faces.push([0, 1, 2]);
    faces.push([0, 2, 3]);
    faces.push([0, 3, 1]);
    faces.push([1, 3, 2]);

    orient_faces(&polytope, &mut faces);

    let mut support_a = [0.0_f64; 3];
    let mut support_b = [0.0_f64; 3];

    for _iteration in 0..MAX_EPA_ITERATIONS {
        let mut min_dist = f64::INFINITY;
        let mut min_face = 0_usize;
        let mut min_normal = [0.0_f64; 3];

        for (fi, face) in faces.iter().enumerate() {
            let normal = face_normal(&polytope, face);
            let len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
            if len <= EPSILON {
                continue;
            }
            let nx = normal[0] / len;
            let ny = normal[1] / len;
            let nz = normal[2] / len;
            let dist = polytope[face[0] * 3] * nx
                + polytope[face[0] * 3 + 1] * ny
                + polytope[face[0] * 3 + 2] * nz;
            let dist_abs = dist.abs();
            if dist_abs < min_dist {
                min_dist = dist_abs;
                min_face = fi;
                if dist >= 0.0 {
                    min_normal = [nx, ny, nz];
                } else {
                    min_normal = [-nx, -ny, -nz];
                }
            }
        }

        if !get_collision_support3d(a, min_normal[0], min_normal[1], min_normal[2], &mut support_a) {
            break;
        }
        if !get_collision_support3d(b, -min_normal[0], -min_normal[1], -min_normal[2], &mut support_b) {
            break;
        }
        let sx = support_a[0] - support_b[0];
        let sy = support_a[1] - support_b[1];
        let sz = support_a[2] - support_b[2];
        let support_dist = sx * min_normal[0] + sy * min_normal[1] + sz * min_normal[2];

        if support_dist - min_dist < EPA_TOLERANCE {
            out.overlapping = true;
            out.normal_x = min_normal[0];
            out.normal_y = min_normal[1];
            out.normal_z = min_normal[2];
            out.depth = min_dist;
            return true;
        }

        if polytope.len() / 3 >= MAX_POLYTOPE_VERTICES {
            break;
        }

        let new_vertex = polytope.len() / 3;
        polytope.push(sx);
        polytope.push(sy);
        polytope.push(sz);

        let mut horizon: Vec<[usize; 2]> = Vec::new();
        let mut visible = vec![false; faces.len()];

        for (fi, face) in faces.iter().enumerate() {
            let normal = face_normal(&polytope, face);
            let len = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
            if len <= EPSILON {
                continue;
            }
            let nx = normal[0] / len;
            let ny = normal[1] / len;
            let nz = normal[2] / len;
            let to_point_x = sx - polytope[face[0] * 3];
            let to_point_y = sy - polytope[face[0] * 3 + 1];
            let to_point_z = sz - polytope[face[0] * 3 + 2];
            if to_point_x * nx + to_point_y * ny + to_point_z * nz > EPSILON {
                visible[fi] = true;
            }
        }

        for fi in 0..faces.len() {
            if !visible[fi] {
                continue;
            }
            let face = faces[fi];
            for edge_idx in 0..3 {
                let u = face[edge_idx];
                let v = face[(edge_idx + 1) % 3];
                push_horizon_edge(&mut horizon, u, v);
            }
        }

        let mut new_faces: Vec<[usize; 3]> = Vec::new();
        for fi in 0..faces.len() {
            if !visible[fi] {
                new_faces.push(faces[fi]);
            }
        }
        for edge in &horizon {
            new_faces.push([edge[0], edge[1], new_vertex]);
        }
        faces = new_faces;
        orient_faces(&polytope, &mut faces);

        if faces.len() >= MAX_EPA_FACES {
            break;
        }
    }

    out.overlapping = true;
    out.normal_x = 1.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.depth = 0.0;
    return true;
}

fn push_horizon_edge(horizon: &mut Vec<[usize; 2]>, u: usize, v: usize) {
    for i in 0..horizon.len() {
        if horizon[i][0] == v && horizon[i][1] == u {
            horizon.swap_remove(i);
            return;
        }
    }
    horizon.push([u, v]);
}

fn face_normal(polytope: &[f64], face: &[usize; 3]) -> [f64; 3] {
    let a = face[0] * 3;
    let b = face[1] * 3;
    let c = face[2] * 3;
    let abx = polytope[b] - polytope[a];
    let aby = polytope[b + 1] - polytope[a + 1];
    let abz = polytope[b + 2] - polytope[a + 2];
    let acx = polytope[c] - polytope[a];
    let acy = polytope[c + 1] - polytope[a + 1];
    let acz = polytope[c + 2] - polytope[a + 2];
    return [
        aby * acz - abz * acy,
        abz * acx - abx * acz,
        abx * acy - aby * acx,
    ];
}

fn orient_faces(polytope: &[f64], faces: &mut Vec<[usize; 3]>) {
    let vert_count = polytope.len() / 3;
    if vert_count == 0 {
        return;
    }
    let mut cx = 0.0_f64;
    let mut cy = 0.0_f64;
    let mut cz = 0.0_f64;
    for i in 0..vert_count {
        cx += polytope[i * 3];
        cy += polytope[i * 3 + 1];
        cz += polytope[i * 3 + 2];
    }
    cx /= vert_count as f64;
    cy /= vert_count as f64;
    cz /= vert_count as f64;

    for face in faces.iter_mut() {
        let normal = face_normal(polytope, face);
        let mid_x = polytope[face[0] * 3] - cx;
        let mid_y = polytope[face[0] * 3 + 1] - cy;
        let mid_z = polytope[face[0] * 3 + 2] - cz;
        if mid_x * normal[0] + mid_y * normal[1] + mid_z * normal[2] < 0.0 {
            let temp = face[1];
            face[1] = face[2];
            face[2] = temp;
        }
    }
}

fn cross3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

fn dot3(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

fn sub3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

fn triple_cross(a: &[f64; 3], b: &[f64; 3], c: &[f64; 3]) -> [f64; 3] {
    let ab = cross3(a, b);
    return cross3(&ab, c);
}

fn create_collision_manifold3d() -> CollisionManifold3D {
    return CollisionManifold3D::default();
}
