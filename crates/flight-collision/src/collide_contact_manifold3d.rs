use crate::collision_face3d::*;
use crate::contact_manifold3d::*;
use crate::test_collision3d::*;
use crate::types::*;

const CLIP_TOLERANCE: f32 = 1e-9;
const CLIP_EPSILON: f32 = 1e-12;
const MAX_CLIPPED_VERTICES: usize = 32;

fn clip_incident_against_reference(
    ref_face: &[f32],
    ref_count: usize,
    inc_face: &[f32],
    inc_count: usize,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
) -> Vec<f32> {
    if ref_count < 2 || inc_count < 1 {
        return inc_face.to_vec();
    }

    let mut input = inc_face.to_vec();
    let mut centroid_x = 0.0_f32;
    let mut centroid_y = 0.0_f32;
    let mut centroid_z = 0.0_f32;
    for i in 0..ref_count {
        centroid_x += ref_face[i * 3];
        centroid_y += ref_face[i * 3 + 1];
        centroid_z += ref_face[i * 3 + 2];
    }
    centroid_x /= ref_count as f32;
    centroid_y /= ref_count as f32;
    centroid_z /= ref_count as f32;

    // Clip against each edge of the reference face
    for i in 0..ref_count {
        let j = (i + 1) % ref_count;
        let e0 = [ref_face[i * 3], ref_face[i * 3 + 1], ref_face[i * 3 + 2]];
        let e1 = [ref_face[j * 3], ref_face[j * 3 + 1], ref_face[j * 3 + 2]];

        // Edge direction
        let ex = e1[0] - e0[0];
        let ey = e1[1] - e0[1];
        let ez = e1[2] - e0[2];

        // Clip plane normal = cross(edge_dir, face_normal), pointing inward
        let cpx = ey * normal_z - ez * normal_y;
        let cpy = ez * normal_x - ex * normal_z;
        let cpz = ex * normal_y - ey * normal_x;
        let cp_len = (cpx * cpx + cpy * cpy + cpz * cpz).sqrt();
        if cp_len < CLIP_EPSILON {
            continue;
        }
        let mut pnx = cpx / cp_len;
        let mut pny = cpy / cp_len;
        let mut pnz = cpz / cp_len;
        if pnx * (centroid_x - e0[0]) + pny * (centroid_y - e0[1]) + pnz * (centroid_z - e0[2])
            > 0.0
        {
            pnx = -pnx;
            pny = -pny;
            pnz = -pnz;
        }
        let plane_d = pnx * e0[0] + pny * e0[1] + pnz * e0[2];

        input = clip_polygon_against_plane(&input, pnx, pny, pnz, plane_d);
        if input.is_empty() {
            break;
        }
        if input.len() / 3 > MAX_CLIPPED_VERTICES {
            input.truncate(MAX_CLIPPED_VERTICES * 3);
            break;
        }
    }

    return input;
}

fn clip_polygon_against_plane(
    verts: &[f32],
    pnx: f32,
    pny: f32,
    pnz: f32,
    plane_d: f32,
) -> Vec<f32> {
    let count = verts.len() / 3;
    if count == 0 {
        return Vec::new();
    }

    let mut output = Vec::new();
    for i in 0..count {
        let j = (i + 1) % count;
        let di = verts[i * 3] * pnx + verts[i * 3 + 1] * pny + verts[i * 3 + 2] * pnz - plane_d;
        let dj = verts[j * 3] * pnx + verts[j * 3 + 1] * pny + verts[j * 3 + 2] * pnz - plane_d;

        if di <= CLIP_TOLERANCE {
            output.push(verts[i * 3]);
            output.push(verts[i * 3 + 1]);
            output.push(verts[i * 3 + 2]);
        }

        if (di > CLIP_TOLERANCE && dj < -CLIP_TOLERANCE)
            || (di < -CLIP_TOLERANCE && dj > CLIP_TOLERANCE)
        {
            let t = di / (di - dj);
            output.push(verts[i * 3] + (verts[j * 3] - verts[i * 3]) * t);
            output.push(verts[i * 3 + 1] + (verts[j * 3 + 1] - verts[i * 3 + 1]) * t);
            output.push(verts[i * 3 + 2] + (verts[j * 3 + 2] - verts[i * 3 + 2]) * t);
        }
    }

    return output;
}

// flight-lint: allow(conform-params) registry passed explicitly for pair, support and face dispatch (D5)
pub fn collide_contact_manifold3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionContactManifold3D,
) -> bool {
    clear_collision_contact_manifold3d(out);

    let mut manifold = crate::types::CollisionManifold3D::default();
    if !test_collision3d(registry, a, b, &mut manifold) {
        return false;
    }

    let normal_x = manifold.normal_x;
    let normal_y = manifold.normal_y;
    let normal_z = manifold.normal_z;
    let depth = manifold.depth;

    out.overlapping = true;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.normal_z = normal_z;

    // A's contacting surface faces toward B, opposite the normal that pushes A out of B.
    let mut face_a = Vec::new();
    let mut face_b = Vec::new();
    let count_a = write_shape_face3d(registry, a, -normal_x, -normal_y, -normal_z, &mut face_a);
    let count_b = write_shape_face3d(registry, b, normal_x, normal_y, normal_z, &mut face_b);

    // For curved shapes with single vertex: write single contact point
    if count_a <= 1 || count_b <= 1 {
        write_single_contact_point(
            registry, a, b, normal_x, normal_y, normal_z, depth, count_a, count_b, out,
        );
        return true;
    }

    let reference_is_a = count_a >= 3
        && (count_b < 3
            || face_alignment(&face_a, count_a, normal_x, normal_y, normal_z)
                >= face_alignment(&face_b, count_b, normal_x, normal_y, normal_z));
    let (reference, reference_count, incident, incident_count) = if reference_is_a {
        (&face_a, count_a, &face_b, count_b)
    } else {
        (&face_b, count_b, &face_a, count_a)
    };
    let (plane_x, plane_y, plane_z) = if reference_is_a {
        (-normal_x, -normal_y, -normal_z)
    } else {
        (normal_x, normal_y, normal_z)
    };
    let clipped = clip_incident_against_reference(
        reference,
        reference_count,
        incident,
        incident_count,
        plane_x,
        plane_y,
        plane_z,
    );

    if clipped.is_empty() {
        write_single_contact_point(
            registry, a, b, normal_x, normal_y, normal_z, depth, count_a, count_b, out,
        );
        return true;
    }

    // Filter clipped points by reference face plane
    let ref_offset = reference[0] * plane_x + reference[1] * plane_y + reference[2] * plane_z;
    let mut pt_count = 0_usize;
    for i in 0..clipped.len() / 3 {
        let px = clipped[i * 3];
        let py = clipped[i * 3 + 1];
        let pz = clipped[i * 3 + 2];
        let separation = ref_offset - (px * plane_x + py * plane_y + pz * plane_z);
        if separation >= 0.0 && pt_count < MAX_COLLISION_CONTACT_POINTS_3D {
            out.points[pt_count].x = px;
            out.points[pt_count].y = py;
            out.points[pt_count].z = pz;
            out.points[pt_count].depth = separation;
            out.points[pt_count].feature_id = (if reference_is_a {
                MAX_COLLISION_CONTACT_POINTS_3D
            } else {
                0
            } + i) as i64;
            pt_count += 1;
        }
    }

    out.point_count = pt_count;
    if pt_count == 0 {
        write_single_contact_point(
            registry, a, b, normal_x, normal_y, normal_z, depth, count_a, count_b, out,
        );
    }
    return true;
}

fn face_alignment(face: &[f32], count: usize, normal_x: f32, normal_y: f32, normal_z: f32) -> f32 {
    if count < 3 {
        return 0.0;
    }
    let ab_x = face[3] - face[0];
    let ab_y = face[4] - face[1];
    let ab_z = face[5] - face[2];
    let ac_x = face[6] - face[0];
    let ac_y = face[7] - face[1];
    let ac_z = face[8] - face[2];
    let face_normal_x = ab_y * ac_z - ab_z * ac_y;
    let face_normal_y = ab_z * ac_x - ab_x * ac_z;
    let face_normal_z = ab_x * ac_y - ab_y * ac_x;
    let length = (face_normal_x * face_normal_x
        + face_normal_y * face_normal_y
        + face_normal_z * face_normal_z)
        .sqrt();
    if length <= CLIP_EPSILON {
        return 0.0;
    }
    return ((face_normal_x * normal_x + face_normal_y * normal_y + face_normal_z * normal_z)
        / length)
        .abs();
}

fn write_shape_face3d(
    registry: &CollisionRegistry3D,
    shape: &CollisionShape3D,
    nx: f32,
    ny: f32,
    nz: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let Some(query) = get_collision_face_query3d(registry, get_collision_shape3d_kind_key(shape))
    else {
        return 0;
    };
    return query(shape, nx, ny, nz, out);
}

fn write_single_contact_point(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    nx: f32,
    ny: f32,
    nz: f32,
    depth: f32,
    count_a: usize,
    count_b: usize,
    out: &mut CollisionContactManifold3D,
) {
    let Some(support_a) = crate::collision_support3d::get_collision_support3d(
        registry,
        get_collision_shape3d_kind_key(a),
    ) else {
        out.point_count = 0;
        return;
    };
    let Some(support_b) = crate::collision_support3d::get_collision_support3d(
        registry,
        get_collision_shape3d_kind_key(b),
    ) else {
        out.point_count = 0;
        return;
    };
    let mut surface_a = [0.0_f32; 3];
    let mut surface_b = [0.0_f32; 3];
    support_a(a, -nx, -ny, -nz, &mut surface_a);
    support_b(b, nx, ny, nz, &mut surface_b);
    let projection_a = surface_a[0] * nx + surface_a[1] * ny + surface_a[2] * nz;
    let projection_b = surface_b[0] * nx + surface_b[1] * ny + surface_b[2] * nz;
    let middle_projection = (projection_a + projection_b) * 0.5;
    if count_a < 2 && count_b >= 2 {
        let shift = middle_projection - projection_a;
        out.points[0].x = surface_a[0] + nx * shift;
        out.points[0].y = surface_a[1] + ny * shift;
        out.points[0].z = surface_a[2] + nz * shift;
    } else if count_b < 2 && count_a >= 2 {
        let shift = middle_projection - projection_b;
        out.points[0].x = surface_b[0] + nx * shift;
        out.points[0].y = surface_b[1] + ny * shift;
        out.points[0].z = surface_b[2] + nz * shift;
    } else {
        out.points[0].x = (surface_a[0] + surface_b[0]) * 0.5;
        out.points[0].y = (surface_a[1] + surface_b[1]) * 0.5;
        out.points[0].z = (surface_a[2] + surface_b[2]) * 0.5;
    }
    out.points[0].depth = depth;
    out.points[0].feature_id = 0;
    out.point_count = 1;
}
