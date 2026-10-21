use crate::collision_support3d::*;
use crate::manifold3d::*;
use crate::types::*;

const MAX_GJK_ITERATIONS: usize = 64;
const MAX_EPA_ITERATIONS: usize = 64;
const MAX_POLYTOPE_VERTICES: usize = 64;
const MAX_EPA_FACES: usize = 128;
const MAX_EPA_HORIZON_EDGES: usize = 128;
// flight-lint: allow(f64) source Float64Array EPA scratch and 1e-9 convergence preserve all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
const EPA_TOLERANCE: f64 = 1e-9;
// flight-lint: allow(f64) source Float64Array GJK/EPA predicates use the 1e-12 degeneracy boundary; f32 produced three gross depth failures
const EPSILON: f64 = 1e-12;

// flight-lint: allow(f64) private source Float64Array simplex/polytope scratch preserves all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
type Vector3 = [f64; 3];

#[derive(Clone, Copy, Default)]
// flight-lint: allow(f64) private source Float64Array EPA face normals/distances preserve all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
struct EpaFace {
    vertices: [usize; 3],
    normal: Vector3,
    distance: f64,
}

struct GjkSimplex {
    points: [Vector3; 4],
    count: usize,
}

fn add_epa_face(
    polytope: &[Vector3],
    faces: &mut [EpaFace; MAX_EPA_FACES],
    face_count: &mut usize,
    mut vertices: [usize; 3],
    interior: Vector3,
) -> bool {
    if *face_count >= MAX_EPA_FACES {
        return false;
    }
    let a = polytope[vertices[0]];
    let ab = subtract(polytope[vertices[1]], a);
    let ac = subtract(polytope[vertices[2]], a);
    let mut normal = cross(ab, ac);
    let length = length(normal);
    if length <= EPSILON {
        return false;
    }
    normal = scale(normal, 1.0 / length);
    if dot(normal, subtract(a, interior)) < 0.0 {
        normal = scale(normal, -1.0);
        vertices.swap(1, 2);
    }
    faces[*face_count] = EpaFace {
        vertices,
        normal,
        distance: dot(a, normal),
    };
    *face_count += 1;
    return true;
}

fn cross(a: Vector3, b: Vector3) -> Vector3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

// flight-lint: allow(f64) private source Float64Array GJK/EPA predicate arithmetic preserves all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
fn dot(a: Vector3, b: Vector3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn is_near_zero(vector: Vector3) -> bool {
    vector[0].abs() <= EPSILON && vector[1].abs() <= EPSILON && vector[2].abs() <= EPSILON
}

// flight-lint: allow(f64) private source Float64Array EPA normal arithmetic preserves all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
fn length(vector: Vector3) -> f64 {
    dot(vector, vector).sqrt()
}

fn record_horizon_edge(
    edges: &mut [[usize; 2]; MAX_EPA_HORIZON_EDGES],
    count: &mut usize,
    from: usize,
    to: usize,
) {
    for index in 0..*count {
        if edges[index] == [to, from] {
            edges[index] = edges[*count - 1];
            *count -= 1;
            return;
        }
    }
    if *count >= MAX_EPA_HORIZON_EDGES {
        return;
    }
    edges[*count] = [from, to];
    *count += 1;
}

fn remove_epa_face(faces: &mut [EpaFace; MAX_EPA_FACES], face_count: &mut usize, index: usize) {
    let last = *face_count - 1;
    if index != last {
        faces[index] = faces[last];
    }
    *face_count -= 1;
}

fn run_gjk3d(
    a: &CollisionShape3D,
    support_a: &CollisionSupport3D,
    b: &CollisionShape3D,
    support_b: &CollisionSupport3D,
) -> Option<GjkSimplex> {
    let mut simplex = GjkSimplex {
        points: [[0.0; 3]; 4],
        count: 1,
    };
    write_minkowski_support3d(
        a,
        support_a,
        b,
        support_b,
        [1.0, 0.0, 0.0],
        &mut simplex.points[0],
    );
    let mut direction = scale(simplex.points[0], -1.0);

    for _ in 0..MAX_GJK_ITERATIONS {
        if direction == [0.0; 3] {
            return None;
        }
        let mut point = [0.0; 3];
        write_minkowski_support3d(a, support_a, b, support_b, direction, &mut point);
        if dot(point, direction) <= 0.0 {
            return None;
        }
        simplex.points[simplex.count] = point;
        simplex.count += 1;
        if update_gjk3d_simplex(&mut simplex, &mut direction) {
            return Some(simplex);
        }
    }
    return None;
}

// flight-lint: allow(f64) private source Float64Array simplex/polytope arithmetic preserves all 1,400 seeded f32-support comparisons; f32 produced three gross depth failures
fn scale(vector: Vector3, factor: f64) -> Vector3 {
    [vector[0] * factor, vector[1] * factor, vector[2] * factor]
}

fn subtract(a: Vector3, b: Vector3) -> Vector3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

// flight-lint: allow(conform-params) registry passed explicitly for caller-owned support dispatch (D5)
pub fn test_collision_support3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    clear_collision_manifold3d(out);
    let Some(support_a) = get_collision_support3d(registry, get_collision_shape3d_kind_key(a))
    else {
        return false;
    };
    let Some(support_b) = get_collision_support3d(registry, get_collision_shape3d_kind_key(b))
    else {
        return false;
    };
    let Some(simplex) = run_gjk3d(a, support_a, b, support_b) else {
        return false;
    };
    return write_epa3d_penetration(a, support_a, b, support_b, &simplex, out);
}

// flight-lint: allow(conform-params) registry passed explicitly for caller-owned support dispatch (D5)
pub fn test_collision_support_overlap3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
) -> bool {
    let (Some(support_a), Some(support_b)) = (
        get_collision_support3d(registry, get_collision_shape3d_kind_key(a)),
        get_collision_support3d(registry, get_collision_shape3d_kind_key(b)),
    ) else {
        return false;
    };
    return run_gjk3d(a, support_a, b, support_b).is_some();
}

fn triple_product(u: Vector3, v: Vector3, w: Vector3) -> Vector3 {
    cross(cross(u, v), w)
}

fn update_gjk3d_simplex(simplex: &mut GjkSimplex, direction: &mut Vector3) -> bool {
    let last = simplex.count - 1;
    let a = simplex.points[last];
    let ao = scale(a, -1.0);
    if simplex.count == 2 {
        let b = simplex.points[0];
        let ab = subtract(b, a);
        if dot(ab, ao) > 0.0 {
            *direction = triple_product(ab, ao, ab);
            if is_near_zero(*direction) {
                *direction = write_any_perpendicular(ab);
            }
            return false;
        }
        simplex.points[0] = a;
        simplex.count = 1;
        *direction = ao;
        return false;
    }
    if simplex.count == 3 {
        update_gjk3d_triangle(simplex, a, ao, direction);
        return false;
    }

    let d_index = 0;
    let c_index = 1;
    let b_index = 2;
    for face in 0..3 {
        let first_index = if face == 0 {
            b_index
        } else if face == 1 {
            c_index
        } else {
            d_index
        };
        let second_index = if face == 0 {
            c_index
        } else if face == 1 {
            d_index
        } else {
            b_index
        };
        let first = simplex.points[first_index];
        let second = simplex.points[second_index];
        let mut normal = cross(subtract(first, a), subtract(second, a));
        let third_index = if face == 0 {
            d_index
        } else if face == 1 {
            b_index
        } else {
            c_index
        };
        if dot(normal, subtract(simplex.points[third_index], a)) > 0.0 {
            normal = scale(normal, -1.0);
        }
        if dot(normal, ao) > 0.0 {
            simplex.points[0] = second;
            simplex.points[1] = first;
            simplex.points[2] = a;
            simplex.count = 3;
            update_gjk3d_triangle(simplex, a, ao, direction);
            return false;
        }
    }
    return true;
}

fn update_gjk3d_triangle(
    simplex: &mut GjkSimplex,
    a: Vector3,
    ao: Vector3,
    direction: &mut Vector3,
) {
    let c = simplex.points[0];
    let b = simplex.points[1];
    let ab = subtract(b, a);
    let ac = subtract(c, a);
    let normal = cross(ab, ac);

    let ac_side = cross(normal, ac);
    if dot(ac_side, ao) > 0.0 {
        simplex.points[1] = a;
        simplex.count = 2;
        *direction = triple_product(ac, ao, ac);
        return;
    }
    let ab_side = cross(ab, normal);
    if dot(ab_side, ao) > 0.0 {
        simplex.points[0] = b;
        simplex.points[1] = a;
        simplex.count = 2;
        *direction = triple_product(ab, ao, ab);
        return;
    }
    if dot(normal, ao) > 0.0 {
        *direction = normal;
    } else {
        simplex.points[0] = b;
        simplex.points[1] = c;
        *direction = scale(normal, -1.0);
    }
    if is_near_zero(*direction) {
        *direction = write_any_perpendicular(ab);
    }
}

fn write_any_perpendicular(vector: Vector3) -> Vector3 {
    let absolute = [vector[0].abs(), vector[1].abs(), vector[2].abs()];
    let axis = if absolute[0] <= absolute[1] && absolute[0] <= absolute[2] {
        [1.0, 0.0, 0.0]
    } else if absolute[1] <= absolute[2] {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    cross(vector, axis)
}

// flight-lint: allow(f64) private source Float64Array EPA orientation/distance scratch preserves all 1,400 seeded f32-support comparisons; public manifold output remains f32
fn write_epa3d_penetration(
    a: &CollisionShape3D,
    support_a: &CollisionSupport3D,
    b: &CollisionShape3D,
    support_b: &CollisionSupport3D,
    simplex: &GjkSimplex,
    out: &mut CollisionManifold3D,
) -> bool {
    if simplex.count < 4 {
        return false;
    }
    let mut polytope = [[0.0; 3]; MAX_POLYTOPE_VERTICES];
    polytope[..4].copy_from_slice(&simplex.points);
    let mut polytope_count = 4;
    let interior = scale(
        [
            polytope[0][0] + polytope[1][0] + polytope[2][0] + polytope[3][0],
            polytope[0][1] + polytope[1][1] + polytope[2][1] + polytope[3][1],
            polytope[0][2] + polytope[1][2] + polytope[2][2] + polytope[3][2],
        ],
        0.25,
    );
    let mut faces = [EpaFace::default(); MAX_EPA_FACES];
    let mut face_count = 0;
    add_epa_face(&polytope, &mut faces, &mut face_count, [0, 1, 2], interior);
    add_epa_face(&polytope, &mut faces, &mut face_count, [0, 1, 3], interior);
    add_epa_face(&polytope, &mut faces, &mut face_count, [0, 2, 3], interior);
    add_epa_face(&polytope, &mut faces, &mut face_count, [1, 2, 3], interior);
    if face_count == 0 {
        return false;
    }

    let mut best_distance = f64::INFINITY;
    let mut best_normal = [0.0; 3];
    let mut horizon_edges = [[0; 2]; MAX_EPA_HORIZON_EDGES];
    for _ in 0..MAX_EPA_ITERATIONS {
        let mut closest = None;
        best_distance = f64::INFINITY;
        for (index, face) in faces.iter().take(face_count).enumerate() {
            if face.distance < best_distance {
                best_distance = face.distance;
                closest = Some(index);
            }
        }
        let Some(closest) = closest else {
            break;
        };
        best_normal = faces[closest].normal;
        let mut point = [0.0; 3];
        write_minkowski_support3d(a, support_a, b, support_b, best_normal, &mut point);
        let reach = dot(point, best_normal);
        if reach - best_distance <= EPA_TOLERANCE || polytope_count >= MAX_POLYTOPE_VERTICES {
            break;
        }

        let mut horizon_count = 0;
        let prior_face_count = face_count;
        for face_index in (0..prior_face_count).rev() {
            let face = faces[face_index];
            if dot(point, face.normal) - face.distance <= 0.0 {
                continue;
            }
            record_horizon_edge(
                &mut horizon_edges,
                &mut horizon_count,
                face.vertices[0],
                face.vertices[1],
            );
            record_horizon_edge(
                &mut horizon_edges,
                &mut horizon_count,
                face.vertices[1],
                face.vertices[2],
            );
            record_horizon_edge(
                &mut horizon_edges,
                &mut horizon_count,
                face.vertices[2],
                face.vertices[0],
            );
            remove_epa_face(&mut faces, &mut face_count, face_index);
        }
        if horizon_count == 0 {
            break;
        }
        let added = polytope_count;
        polytope[added] = point;
        polytope_count += 1;
        for edge in horizon_edges.iter().take(horizon_count) {
            add_epa_face(
                &polytope,
                &mut faces,
                &mut face_count,
                [edge[0], edge[1], added],
                interior,
            );
        }
        if face_count == 0 {
            break;
        }
    }
    if best_distance == f64::INFINITY {
        return false;
    }
    out.overlapping = true;
    out.normal_x = -best_normal[0] as f32;
    out.normal_y = -best_normal[1] as f32;
    out.normal_z = -best_normal[2] as f32;
    out.depth = best_distance as f32;
    return true;
}

// flight-lint: allow(f64) f32 support results are promoted losslessly into private source Float64Array GJK/EPA scratch; public callbacks remain f32
fn write_minkowski_support3d(
    a: &CollisionShape3D,
    support_a: &CollisionSupport3D,
    b: &CollisionShape3D,
    support_b: &CollisionSupport3D,
    direction: Vector3,
    out: &mut Vector3,
) {
    let (mut point_a, mut point_b) = ([0.0_f32; 3], [0.0_f32; 3]);
    support_a(
        a,
        direction[0] as f32,
        direction[1] as f32,
        direction[2] as f32,
        &mut point_a,
    );
    support_b(
        b,
        -direction[0] as f32,
        -direction[1] as f32,
        -direction[2] as f32,
        &mut point_b,
    );
    *out = [
        point_a[0] as f64 - point_b[0] as f64,
        point_a[1] as f64 - point_b[1] as f64,
        point_a[2] as f64 - point_b[2] as f64,
    ];
}
