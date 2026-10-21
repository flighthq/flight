const HULL_EPSILON: f32 = 1e-10;

fn add_point_to_hull(points: &[f32], pi: usize, faces: &mut Vec<[usize; 3]>) {
    let px = points[pi * 3];
    let py = points[pi * 3 + 1];
    let pz = points[pi * 3 + 2];

    let mut visible = vec![false; faces.len()];
    let mut any_visible = false;
    for (fi, face) in faces.iter().enumerate() {
        let n = face_normal_from_points(points, face);
        let to_x = px - points[face[0] * 3];
        let to_y = py - points[face[0] * 3 + 1];
        let to_z = pz - points[face[0] * 3 + 2];
        if to_x * n[0] + to_y * n[1] + to_z * n[2] > HULL_EPSILON {
            visible[fi] = true;
            any_visible = true;
        }
    }

    if !any_visible {
        return;
    }

    // Find horizon edges
    let mut horizon: Vec<[usize; 2]> = Vec::new();
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

    // Remove visible faces
    let mut new_faces: Vec<[usize; 3]> = Vec::new();
    for fi in 0..faces.len() {
        if !visible[fi] {
            new_faces.push(faces[fi]);
        }
    }

    // Create new faces from horizon edges to the new point
    for edge in &horizon {
        new_faces.push([edge[0], edge[1], pi]);
    }

    // Re-orient new faces outward
    if !new_faces.is_empty() {
        // Compute centroid from all hull vertices
        let mut all_verts: Vec<usize> = Vec::new();
        for f in &new_faces {
            for &v in f {
                if !all_verts.contains(&v) {
                    all_verts.push(v);
                }
            }
        }
        let mut cx = 0.0_f32;
        let mut cy = 0.0_f32;
        let mut cz = 0.0_f32;
        for &v in &all_verts {
            cx += points[v * 3];
            cy += points[v * 3 + 1];
            cz += points[v * 3 + 2];
        }
        let inv = 1.0 / all_verts.len() as f32;
        cx *= inv;
        cy *= inv;
        cz *= inv;

        for face in new_faces.iter_mut() {
            let n = face_normal_from_points(points, face);
            let mid_x = points[face[0] * 3] - cx;
            let mid_y = points[face[0] * 3 + 1] - cy;
            let mid_z = points[face[0] * 3 + 2] - cz;
            if mid_x * n[0] + mid_y * n[1] + mid_z * n[2] < 0.0 {
                let tmp = face[1];
                face[1] = face[2];
                face[2] = tmp;
            }
        }
    }

    *faces = new_faces;
}

fn face_normal_from_points(points: &[f32], face: &[usize; 3]) -> [f32; 3] {
    let a = face[0] * 3;
    let b = face[1] * 3;
    let c = face[2] * 3;
    let abx = points[b] - points[a];
    let aby = points[b + 1] - points[a + 1];
    let abz = points[b + 2] - points[a + 2];
    let acx = points[c] - points[a];
    let acy = points[c + 1] - points[a + 1];
    let acz = points[c + 2] - points[a + 2];
    [
        aby * acz - abz * acy,
        abz * acx - abx * acz,
        abx * acy - aby * acx,
    ]
}

fn find_initial_tetrahedron(points: &[f32], count: usize) -> Option<[usize; 4]> {
    if count < 4 {
        return None;
    }

    // Find two most distant points
    let mut max_dist = 0.0_f32;
    let mut i0 = 0_usize;
    let mut i1 = 1_usize;
    for i in 0..count {
        for j in (i + 1)..count {
            let dx = points[j * 3] - points[i * 3];
            let dy = points[j * 3 + 1] - points[i * 3 + 1];
            let dz = points[j * 3 + 2] - points[i * 3 + 2];
            let d = dx * dx + dy * dy + dz * dz;
            if d > max_dist {
                max_dist = d;
                i0 = i;
                i1 = j;
            }
        }
    }
    if max_dist < HULL_EPSILON {
        return None;
    }

    // Find point most distant from the line i0-i1
    let lx = points[i1 * 3] - points[i0 * 3];
    let ly = points[i1 * 3 + 1] - points[i0 * 3 + 1];
    let lz = points[i1 * 3 + 2] - points[i0 * 3 + 2];
    let ll = (lx * lx + ly * ly + lz * lz).sqrt();
    let ulx = lx / ll;
    let uly = ly / ll;
    let ulz = lz / ll;
    let mut max_dist2 = 0.0_f32;
    let mut i2 = 0_usize;
    for i in 0..count {
        if i == i0 || i == i1 {
            continue;
        }
        let dx = points[i * 3] - points[i0 * 3];
        let dy = points[i * 3 + 1] - points[i0 * 3 + 1];
        let dz = points[i * 3 + 2] - points[i0 * 3 + 2];
        let proj = dx * ulx + dy * uly + dz * ulz;
        let rx = dx - proj * ulx;
        let ry = dy - proj * uly;
        let rz = dz - proj * ulz;
        let d = rx * rx + ry * ry + rz * rz;
        if d > max_dist2 {
            max_dist2 = d;
            i2 = i;
        }
    }
    if max_dist2 < HULL_EPSILON {
        return None;
    }

    // Find point most distant from the plane i0-i1-i2
    let abx = points[i1 * 3] - points[i0 * 3];
    let aby = points[i1 * 3 + 1] - points[i0 * 3 + 1];
    let abz = points[i1 * 3 + 2] - points[i0 * 3 + 2];
    let acx = points[i2 * 3] - points[i0 * 3];
    let acy = points[i2 * 3 + 1] - points[i0 * 3 + 1];
    let acz = points[i2 * 3 + 2] - points[i0 * 3 + 2];
    let mut nx = aby * acz - abz * acy;
    let mut ny = abz * acx - abx * acz;
    let mut nz = abx * acy - aby * acx;
    let nlen = (nx * nx + ny * ny + nz * nz).sqrt();
    if nlen < HULL_EPSILON {
        return None;
    }
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;

    let mut max_dist3 = 0.0_f32;
    let mut i3 = 0_usize;
    for i in 0..count {
        if i == i0 || i == i1 || i == i2 {
            continue;
        }
        let dx = points[i * 3] - points[i0 * 3];
        let dy = points[i * 3 + 1] - points[i0 * 3 + 1];
        let dz = points[i * 3 + 2] - points[i0 * 3 + 2];
        let d = (dx * nx + dy * ny + dz * nz).abs();
        if d > max_dist3 {
            max_dist3 = d;
            i3 = i;
        }
    }
    if max_dist3 < HULL_EPSILON {
        return None;
    }

    return Some([i0, i1, i2, i3]);
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

/// Compute the convex hull of input points and write triangle face indices.
/// Returns the number of triangles written, or 0 on failure.
/// `points` is a flat array of [x,y,z,...] coordinates.
/// `out` will be cleared and filled with triangle index triples.
// flight-lint: allow(conform-params) D9 requires caller-owned outputs first
pub fn write_collision_convex_hull_faces3d(out: &mut Vec<usize>, points: &Vec<f32>) -> usize {
    out.clear();
    let count = points.len() / 3;
    if count < 4 {
        return 0;
    }

    // Find initial tetrahedron
    let tet = match find_initial_tetrahedron(points, count) {
        Some(t) => t,
        None => return 0,
    };

    let mut faces: Vec<[usize; 3]> = Vec::new();
    faces.push([tet[0], tet[1], tet[2]]);
    faces.push([tet[0], tet[2], tet[3]]);
    faces.push([tet[0], tet[3], tet[1]]);
    faces.push([tet[1], tet[3], tet[2]]);

    // Orient all faces outward from centroid
    let cx =
        (points[tet[0] * 3] + points[tet[1] * 3] + points[tet[2] * 3] + points[tet[3] * 3]) * 0.25;
    let cy = (points[tet[0] * 3 + 1]
        + points[tet[1] * 3 + 1]
        + points[tet[2] * 3 + 1]
        + points[tet[3] * 3 + 1])
        * 0.25;
    let cz = (points[tet[0] * 3 + 2]
        + points[tet[1] * 3 + 2]
        + points[tet[2] * 3 + 2]
        + points[tet[3] * 3 + 2])
        * 0.25;

    for face in faces.iter_mut() {
        let n = face_normal_from_points(points, face);
        let mid_x = points[face[0] * 3] - cx;
        let mid_y = points[face[0] * 3 + 1] - cy;
        let mid_z = points[face[0] * 3 + 2] - cz;
        if mid_x * n[0] + mid_y * n[1] + mid_z * n[2] < 0.0 {
            let tmp = face[1];
            face[1] = face[2];
            face[2] = tmp;
        }
    }

    // Incrementally add remaining points
    let tet_set = [tet[0], tet[1], tet[2], tet[3]];
    for pi in 0..count {
        if tet_set.contains(&pi) {
            continue;
        }
        add_point_to_hull(points, pi, &mut faces);
    }

    let tri_count = faces.len();
    for face in &faces {
        out.push(face[0]);
        out.push(face[1]);
        out.push(face[2]);
    }
    return tri_count;
}
