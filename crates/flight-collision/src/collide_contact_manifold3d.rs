use crate::collision_face3d::*;
use crate::contact_manifold3d::*;
use crate::test_collision3d::*;
use crate::types::*;

// flight-lint: allow(f64) Principal 8d88: source number clipping scratch retains the exact 1e-9 boundary
const CLIP_TOLERANCE: f64 = 1e-9;
// flight-lint: allow(f64) Principal 8d88: source number face predicates retain the exact 1e-12 boundary
const CLIP_EPSILON: f64 = 1e-12;
const MAX_CLIPPED_VERTICES: usize = 32;

// flight-lint: allow(f64) Principal c2e26ae9: private source-number faces stay wide through clipping
fn clip_incident_against_reference(
    ref_face: &[f64],
    ref_count: usize,
    inc_face: &[f64],
    inc_count: usize,
    normal_x: f64,
    normal_y: f64,
    normal_z: f64,
) -> Vec<f64> {
    if ref_count < 2 || inc_count < 1 {
        return inc_face[..inc_count * 3].to_vec();
    }

    let mut input = inc_face[..inc_count * 3].to_vec();
    let mut centroid_x = 0.0_f64;
    let mut centroid_y = 0.0_f64;
    let mut centroid_z = 0.0_f64;
    for i in 0..ref_count {
        centroid_x += ref_face[i * 3];
        centroid_y += ref_face[i * 3 + 1];
        centroid_z += ref_face[i * 3 + 2];
    }
    centroid_x /= ref_count as f64;
    centroid_y /= ref_count as f64;
    centroid_z /= ref_count as f64;
    let plane_x = normal_x;
    let plane_y = normal_y;
    let plane_z = normal_z;

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
        let cpx = ey * plane_z - ez * plane_y;
        let cpy = ez * plane_x - ex * plane_z;
        let cpz = ex * plane_y - ey * plane_x;
        let cp_len = (cpx * cpx + cpy * cpy + cpz * cpz).sqrt();
        if cp_len <= CLIP_EPSILON {
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

// flight-lint: allow(f64) Principal 8d88: source-number Sutherland-Hodgman scratch preserves crossing predicates
fn clip_polygon_against_plane(
    verts: &[f64],
    pnx: f64,
    pny: f64,
    pnz: f64,
    plane_d: f64,
) -> Vec<f64> {
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
            if output.len() / 3 >= MAX_CLIPPED_VERTICES {
                break;
            }
            output.push(verts[i * 3]);
            output.push(verts[i * 3 + 1]);
            output.push(verts[i * 3 + 2]);
        }

        if (di > CLIP_TOLERANCE && dj < -CLIP_TOLERANCE)
            || (di < -CLIP_TOLERANCE && dj > CLIP_TOLERANCE)
        {
            if output.len() / 3 >= MAX_CLIPPED_VERTICES {
                break;
            }
            let t = di / (di - dj);
            output.push(verts[i * 3] + (verts[j * 3] - verts[i * 3]) * t);
            output.push(verts[i * 3 + 1] + (verts[j * 3 + 1] - verts[i * 3 + 1]) * t);
            output.push(verts[i * 3 + 2] + (verts[j * 3 + 2] - verts[i * 3 + 2]) * t);
        }
    }

    return output;
}

// flight-lint: allow(f64) Principal c2e26ae9: private source-number manifold generation, feature selection and clipping narrow only final public contacts
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
    let normal_x64 = f64::from(normal_x);
    let normal_y64 = f64::from(normal_y);
    let normal_z64 = f64::from(normal_z);

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
            || face_alignment(&face_a, count_a, normal_x64, normal_y64, normal_z64)
                >= face_alignment(&face_b, count_b, normal_x64, normal_y64, normal_z64));
    let (reference, reference_count, incident, incident_count) = if reference_is_a {
        (&face_a, count_a, &face_b, count_b)
    } else {
        (&face_b, count_b, &face_a, count_a)
    };
    let (plane_x, plane_y, plane_z) = if reference_is_a {
        (-normal_x64, -normal_y64, -normal_z64)
    } else {
        (normal_x64, normal_y64, normal_z64)
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
            out.points[pt_count].x = px as f32;
            out.points[pt_count].y = py as f32;
            out.points[pt_count].z = pz as f32;
            out.points[pt_count].depth = separation as f32;
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

// flight-lint: allow(f64) Principal c2e26ae9: private source-number faces stay wide through alignment predicates
fn face_alignment(face: &[f64], count: usize, normal_x: f64, normal_y: f64, normal_z: f64) -> f64 {
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

// flight-lint: allow(f64) Principal c2e26ae9: invokes the unchanged f32 face callback once, retaining exact built-in private scratch when outputs agree
fn write_shape_face3d(
    registry: &CollisionRegistry3D,
    shape: &CollisionShape3D,
    nx: f32,
    ny: f32,
    nz: f32,
    out: &mut Vec<f64>,
) -> usize {
    out.clear();
    let Some(query) = get_collision_face_query3d(registry, get_collision_shape3d_kind_key(shape))
    else {
        return 0;
    };
    let mut public_face = Vec::new();
    let count = query(shape, nx, ny, nz, &mut public_face);
    let built_in_face = write_collision_shape_face3d_f64(shape, nx, ny, nz);
    if let Some(face) = built_in_face
        && face.len() == count * 3
        && public_face.len() >= count * 3
        && face
            .iter()
            .zip(&public_face)
            .all(|(wide, public)| (*wide as f32).to_bits() == public.to_bits())
    {
        *out = face;
    } else {
        out.extend(
            public_face[..count * 3]
                .iter()
                .map(|value| f64::from(*value)),
        );
    }
    return count;
}

// flight-lint: allow(f64) Principal c2e26ae9: public f32 support callback outputs are losslessly promoted for private contact-point scratch
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
    let normal_x = f64::from(nx);
    let normal_y = f64::from(ny);
    let normal_z = f64::from(nz);
    let surface_a_x = f64::from(surface_a[0]);
    let surface_a_y = f64::from(surface_a[1]);
    let surface_a_z = f64::from(surface_a[2]);
    let surface_b_x = f64::from(surface_b[0]);
    let surface_b_y = f64::from(surface_b[1]);
    let surface_b_z = f64::from(surface_b[2]);
    let projection_a = surface_a_x * normal_x + surface_a_y * normal_y + surface_a_z * normal_z;
    let projection_b = surface_b_x * normal_x + surface_b_y * normal_y + surface_b_z * normal_z;
    let middle_projection = (projection_a + projection_b) * 0.5;
    if count_a < 2 && count_b >= 2 {
        let shift = middle_projection - projection_a;
        out.points[0].x = (surface_a_x + normal_x * shift) as f32;
        out.points[0].y = (surface_a_y + normal_y * shift) as f32;
        out.points[0].z = (surface_a_z + normal_z * shift) as f32;
    } else if count_b < 2 && count_a >= 2 {
        let shift = middle_projection - projection_b;
        out.points[0].x = (surface_b_x + normal_x * shift) as f32;
        out.points[0].y = (surface_b_y + normal_y * shift) as f32;
        out.points[0].z = (surface_b_z + normal_z * shift) as f32;
    } else {
        out.points[0].x = ((surface_a_x + surface_b_x) * 0.5) as f32;
        out.points[0].y = ((surface_a_y + surface_b_y) * 0.5) as f32;
        out.points[0].z = ((surface_a_z + surface_b_z) * 0.5) as f32;
    }
    out.points[0].depth = depth;
    out.points[0].feature_id = 0;
    out.point_count = 1;
}
