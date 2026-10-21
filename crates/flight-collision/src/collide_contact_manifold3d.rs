use crate::collision_face3d::*;
use crate::contact_feature_id::*;
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
        let pnx = cpx / cp_len;
        let pny = cpy / cp_len;
        let pnz = cpz / cp_len;
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

        if di >= -CLIP_TOLERANCE {
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

    // Get reference and incident faces
    let mut face_a = Vec::new();
    let mut face_b = Vec::new();
    let count_a = write_shape_face3d(registry, a, normal_x, normal_y, normal_z, &mut face_a);
    let count_b = write_shape_face3d(registry, b, -normal_x, -normal_y, -normal_z, &mut face_b);

    // For curved shapes with single vertex: write single contact point
    if count_a <= 1 || count_b <= 1 {
        return write_single_contact_point(
            normal_x, normal_y, normal_z, depth, &face_a, count_a, &face_b, count_b, out,
        );
    }

    // Clip incident face against reference face side planes (Sutherland-Hodgman)
    // Determine which face is the reference (A) and which is incident (B)
    let clipped = clip_incident_against_reference(
        &face_a, count_a, &face_b, count_b, normal_x, normal_y, normal_z,
    );

    if clipped.is_empty() {
        return write_single_contact_point(
            normal_x, normal_y, normal_z, depth, &face_a, count_a, &face_b, count_b, out,
        );
    }

    // Filter clipped points by reference face plane
    let ref_offset = face_a[0] * normal_x + face_a[1] * normal_y + face_a[2] * normal_z;
    out.overlapping = true;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.normal_z = normal_z;

    let mut pt_count = 0_usize;
    for i in 0..clipped.len() / 3 {
        let px = clipped[i * 3];
        let py = clipped[i * 3 + 1];
        let pz = clipped[i * 3 + 2];
        let sep = px * normal_x + py * normal_y + pz * normal_z - ref_offset;
        if sep <= CLIP_TOLERANCE && pt_count < MAX_COLLISION_CONTACT_POINTS_3D {
            out.points[pt_count].x = px;
            out.points[pt_count].y = py;
            out.points[pt_count].z = pz;
            out.points[pt_count].depth = -sep + depth;
            out.points[pt_count].feature_id =
                pack_contact_feature_id(false, i as i64, pt_count as i64, false);
            pt_count += 1;
        }
    }

    out.point_count = pt_count;
    return pt_count > 0;
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
    if let Some(query) = get_collision_face_query3d(registry, get_collision_shape3d_kind_key(shape))
    {
        let count = query(shape, nx, ny, nz, out);
        if count > 0 {
            return count;
        }
    }

    // Preserve the incumbent one-point fallback for curved features while face selection becomes
    // registry-driven. The source contact layer obtains the same point from the support registry
    // after a zero face count; doing it here keeps this port's existing clipping path unchanged.
    let Some(support) = crate::collision_support3d::get_collision_support3d(
        registry,
        get_collision_shape3d_kind_key(shape),
    ) else {
        return 0;
    };
    let mut point = [0.0_f32; 3];
    support(shape, nx, ny, nz, &mut point);
    out.extend_from_slice(&point);
    return 1;
}

fn write_single_contact_point(
    nx: f32,
    ny: f32,
    nz: f32,
    depth: f32,
    face_a: &[f32],
    count_a: usize,
    face_b: &[f32],
    count_b: usize,
    out: &mut CollisionContactManifold3D,
) -> bool {
    out.overlapping = true;
    out.normal_x = nx;
    out.normal_y = ny;
    out.normal_z = nz;
    out.point_count = 1;

    // Use the midpoint between the closest vertices on each face
    let (ax, ay, az) = if count_a >= 1 {
        (face_a[0], face_a[1], face_a[2])
    } else {
        (0.0, 0.0, 0.0)
    };
    let (bx, by, bz) = if count_b >= 1 {
        (face_b[0], face_b[1], face_b[2])
    } else {
        (0.0, 0.0, 0.0)
    };
    out.points[0].x = (ax + bx) * 0.5;
    out.points[0].y = (ay + by) * 0.5;
    out.points[0].z = (az + bz) * 0.5;
    out.points[0].depth = depth;
    out.points[0].feature_id = 0;
    return true;
}
